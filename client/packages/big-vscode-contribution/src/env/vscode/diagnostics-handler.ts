/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { SetMarkersAction } from '@eclipse-glsp/protocol';
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
    protected readonly disposeListener: vscode.Disposable;

    constructor(@inject(TYPES.ClientManager) protected readonly clientManager: ClientManager<TDocument>) {
        this.disposeListener = this.clientManager.onDidDispose(client => {
            this.diagnostics.set(client.document.uri, undefined);
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

        const diagnostics = message.action.markers.map(
            marker =>
                new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    marker.description,
                    severityMap.get(marker.kind)
                )
        );

        this.diagnostics.set(client.document.uri, diagnostics);

        return {
            processedMessage: message,
            messageChanged: true
        };
    }

    dispose(): void {
        this.disposeListener.dispose();
        this.diagnostics.dispose();
    }
}
