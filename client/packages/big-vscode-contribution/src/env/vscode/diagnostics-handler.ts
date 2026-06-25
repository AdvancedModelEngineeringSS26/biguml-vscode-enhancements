/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { MarkersReason, SetMarkersAction } from '@eclipse-glsp/protocol';
import type { ActionMessage, GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import * as vscode from 'vscode';
import type { VscodeActionHandler } from '../common/action-handler.js';
import type { MessageOrigin, MessageProcessingResult } from '../common/message-routing.js';
import { TYPES } from '../common/types.js';
import type { ClientManager } from './client-manager.js';

@injectable()
export class DiagnosticsHandler<TDocument extends vscode.CustomDocument = vscode.CustomDocument>
    implements VscodeActionHandler<TDocument>, vscode.Disposable
{
    readonly actionKinds = [SetMarkersAction.KIND] as const;

    protected readonly diagnostics = vscode.languages.createDiagnosticCollection();
    /** Diagnostics grouped by URI and marker reason to support selective removal on editor close. */
    protected readonly markersByReason = new Map<string, Map<string, vscode.Diagnostic[]>>();
    protected readonly disposeListener: vscode.Disposable;

    constructor(@inject(TYPES.ClientManager) protected readonly clientManager: ClientManager<TDocument>) {
        this.disposeListener = this.clientManager.onDidDispose(client => {
            // Keep live markers visible after close — the server reissues them on reopen.
            // Only batch markers (from explicit validation runs) are removed. See eclipse-glsp/glsp#990.
            this.clearMarkersOnClose(client.document.uri);
        });
    }

    handle(
        message: ActionMessage,
        client: GlspVscodeClient<TDocument> | undefined,
        _origin: MessageOrigin
    ): MessageProcessingResult {
        if (!client || !SetMarkersAction.is(message.action)) {
            return {
                processedMessage: message,
                messageChanged: false
            };
        }

        const severityMap = new Map<string, vscode.DiagnosticSeverity>([
            ['info', vscode.DiagnosticSeverity.Information],
            ['warning', vscode.DiagnosticSeverity.Warning],
            ['error', vscode.DiagnosticSeverity.Error]
        ]);

        const incoming = message.action.markers.map(
            marker =>
                new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    marker.description,
                    severityMap.get(marker.kind)
                )
        );

        const reason = message.action.reason ?? MarkersReason.BATCH;
        const uriKey = client.document.uri.toString();
        if (!this.markersByReason.has(uriKey)) {
            this.markersByReason.set(uriKey, new Map());
        }
        this.markersByReason.get(uriKey)!.set(reason, incoming);

        const merged = Array.from(this.markersByReason.get(uriKey)!.values()).flat();
        this.diagnostics.set(client.document.uri, merged);

        return {
            processedMessage: message,
            messageChanged: true
        };
    }

    /**
     * Removes only batch markers when a diagram editor is closed, keeping live markers visible.
     * Aligns VS Code behaviour with Theia's marker manager. See eclipse-glsp/glsp#990.
     */
    protected clearMarkersOnClose(uri: vscode.Uri): void {
        const uriKey = uri.toString();
        const reasonMap = this.markersByReason.get(uriKey);

        if (!reasonMap) {
            this.diagnostics.set(uri, undefined);
            return;
        }

        reasonMap.delete(MarkersReason.BATCH);

        if (reasonMap.size === 0) {
            this.markersByReason.delete(uriKey);
            this.diagnostics.set(uri, undefined);
        } else {
            const remaining = Array.from(reasonMap.values()).flat();
            this.diagnostics.set(uri, remaining);
        }
    }

    dispose(): void {
        this.disposeListener.dispose();
        this.diagnostics.dispose();
        this.markersByReason.clear();
    }
}
