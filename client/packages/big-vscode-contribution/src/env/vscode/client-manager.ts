/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { injectable } from 'inversify';
import * as vscode from 'vscode';

@injectable()
export class ClientManager<TDocument extends vscode.CustomDocument = vscode.CustomDocument> implements vscode.Disposable {
    protected readonly clientsById = new Map<string, GlspVscodeClient<TDocument>>();
    protected readonly clientIdsByDocument = new Map<TDocument, string>();
    protected readonly panelDisposables = new Map<string, vscode.Disposable>();

    protected readonly onDidRegisterEmitter = new vscode.EventEmitter<GlspVscodeClient<TDocument>>();
    readonly onDidRegister = this.onDidRegisterEmitter.event;

    protected readonly onDidDisposeEmitter = new vscode.EventEmitter<GlspVscodeClient<TDocument>>();
    readonly onDidDispose = this.onDidDisposeEmitter.event;

    /**
     * Contribution-native owner of client registration and lookup state. This
     * replaces direct client/document tracking on the legacy connector.
     */
    get clients(): readonly GlspVscodeClient<TDocument>[] {
        return Array.from(this.clientsById.values());
    }

    get activeClient(): GlspVscodeClient<TDocument> | undefined {
        return this.clients.find(client => client.webviewEndpoint.webviewPanel.active);
    }

    register(client: GlspVscodeClient<TDocument>, options: { managePanelLifecycle?: boolean } = {}): void {
        this.clientsById.set(client.clientId, client);
        this.clientIdsByDocument.set(client.document, client.clientId);

        if (options.managePanelLifecycle !== false) {
            const panelDisposable = client.webviewEndpoint.webviewPanel.onDidDispose(() => {
                this.disposeClient(client.clientId);
            });
            this.panelDisposables.set(client.clientId, panelDisposable);
        }

        this.onDidRegisterEmitter.fire(client);
    }

    getClient(clientId: string): GlspVscodeClient<TDocument> | undefined {
        return this.clientsById.get(clientId);
    }

    getClientId(document: TDocument): string | undefined {
        return this.clientIdsByDocument.get(document);
    }

    getClientByDocument(document: TDocument): GlspVscodeClient<TDocument> | undefined {
        const clientId = this.getClientId(document);
        return clientId ? this.getClient(clientId) : undefined;
    }

    disposeClient(clientId: string): void {
        const client = this.clientsById.get(clientId);
        if (!client) {
            return;
        }

        this.panelDisposables.get(clientId)?.dispose();
        this.panelDisposables.delete(clientId);
        this.clientsById.delete(clientId);
        this.clientIdsByDocument.delete(client.document);
        this.onDidDisposeEmitter.fire(client);
    }

    dispose(): void {
        Array.from(this.panelDisposables.values()).forEach(disposable => disposable.dispose());
        this.panelDisposables.clear();
        this.clientsById.clear();
        this.clientIdsByDocument.clear();
        this.onDidRegisterEmitter.dispose();
        this.onDidDisposeEmitter.dispose();
    }
}
