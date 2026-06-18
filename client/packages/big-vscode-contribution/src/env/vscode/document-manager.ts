/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { RequestModelAction, SaveModelAction } from '@eclipse-glsp/protocol';
import { Deferred, DisposableCollection } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import * as vscode from 'vscode';
import { TYPES } from '../common/types.js';
import type { ActionDispatcher } from './action-dispatcher.js';
import type { ClientManager } from './client-manager.js';

@injectable()
export class DocumentManager<TDocument extends vscode.CustomDocument = vscode.CustomDocument> implements vscode.Disposable {
    protected readonly onDidChangeCustomDocumentEmitter = new vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<TDocument> | vscode.CustomDocumentContentChangeEvent<TDocument>
    >();
    protected readonly pendingSaves = new Map<string, Deferred<void>>();
    protected readonly toDispose = new DisposableCollection();
    readonly onDidChangeCustomDocument = this.onDidChangeCustomDocumentEmitter.event;

    /**
     * Contribution-native owner of custom document lifecycle coordination. This
     * replaces save/revert orchestration that previously lived on the connector.
     */

    constructor(
        @inject(TYPES.ClientManager) protected readonly clientManager: ClientManager<TDocument>,
        @inject(TYPES.ActionDispatcher) protected readonly actionDispatcher: ActionDispatcher<TDocument>
    ) {
        this.toDispose.push(
            this.clientManager.onDidDispose(client => {
                this.rejectPendingSave(client.clientId, `DocumentManager.saveDocument failed: save aborted because client ${client.clientId} was disposed.`);
            })
        );
    }

    notifyDocumentSaved(clientId: string, _document: TDocument): void {
        const pendingSave = this.pendingSaves.get(clientId);
        if (!pendingSave) {
            return;
        }

        this.pendingSaves.delete(clientId);
        pendingSave.resolve();
    }

    notifyDocumentEdit(event: vscode.CustomDocumentEditEvent<TDocument>): void {
        this.onDidChangeCustomDocumentEmitter.fire(event);
    }

    notifyDocumentChange(document: TDocument): void {
        this.onDidChangeCustomDocumentEmitter.fire({ document });
    }

    async saveDocument(document: TDocument, destination?: vscode.Uri): Promise<void> {
        const clientId = this.clientManager.getClientId(document);
        if (!clientId) {
            throw new Error('DocumentManager.saveDocument failed: document is not registered.');
        }

        if (this.pendingSaves.has(clientId)) {
            throw new Error(`DocumentManager.saveDocument failed: save already pending for client ${clientId}.`);
        }

        const deferred = new Deferred<void>();
        this.pendingSaves.set(clientId, deferred);

        const dispatched = this.actionDispatcher.dispatch(SaveModelAction.create({ fileUri: destination?.path }), clientId);
        if (!dispatched) {
            this.pendingSaves.delete(clientId);
            throw new Error(`DocumentManager.saveDocument failed: could not dispatch save for client ${clientId}.`);
        }

        await deferred.promise;
    }

    async revertDocument(document: TDocument, diagramType: string): Promise<void> {
        const clientId = this.clientManager.getClientId(document);
        if (!clientId) {
            throw new Error('DocumentManager.revertDocument failed: document is not registered.');
        }

        const client = this.clientManager.getClient(clientId);
        if (!client) {
            throw new Error(`DocumentManager.revertDocument failed: client ${clientId} is not registered.`);
        }

        const dispatched = this.actionDispatcher.dispatch(
            RequestModelAction.create({
                options: {
                    sourceUri: this.revertSourceUri(document),
                    diagramType,
                    forceReloadFromDisk: true
                }
            }),
            clientId
        );

        if (!dispatched) {
            throw new Error(`DocumentManager.revertDocument failed: could not dispatch revert for client ${clientId}.`);
        }
    }

    protected revertSourceUri(document: TDocument): string {
        const documentUris = document as TDocument & {
            restoredModelUri?: vscode.Uri;
            sourceUri?: vscode.Uri;
        };
        return documentUris.restoredModelUri?.toString() ?? documentUris.sourceUri?.toString() ?? document.uri.toString();
    }

    dispose(): void {
        this.toDispose.dispose();
        this.pendingSaves.forEach((_pendingSave, clientId) => {
            this.rejectPendingSave(
                clientId,
                `DocumentManager.dispose aborted save because the document manager was disposed for client ${clientId}.`
            );
        });
        this.pendingSaves.clear();
        this.onDidChangeCustomDocumentEmitter.dispose();
    }

    protected rejectPendingSave(clientId: string, message: string): void {
        const pendingSave = this.pendingSaves.get(clientId);
        if (!pendingSave) {
            return;
        }

        this.pendingSaves.delete(clientId);
        pendingSave.reject(new Error(message));
    }
}
