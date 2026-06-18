/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { Action } from '@eclipse-glsp/protocol';
import {
    ActionMessage,
    Disposable,
    DisposableCollection,
    type Args,
    type GlspVscodeClient,
    type GlspVscodeServer
} from '@eclipse-glsp/vscode-integration';
import { inject, injectable, multiInject, optional } from 'inversify';
import type * as vscode from 'vscode';
import type { VscodeMessagePropagationFilter } from '../common/message-filter.js';
import type { MessageOrigin, MessageProcessingResult } from '../common/message-routing.js';
import { TYPES } from '../common/types.js';
import type { ActionDispatcher } from './action-dispatcher.js';
import type { ActionRouter } from './action-router.js';
import type { ClientManager } from './client-manager.js';
import type { ClientRegistrationContribution } from './client-registration.js';
import type { DocumentManager } from './document-manager.js';
import type { VscodeContributionLifecycle } from './vscode-contribution-lifecycle.js';

export interface RegisterClientOptions {
    readonly disposeClientSessionArgs?: Args;
    readonly managePanelLifecycle?: boolean;
}

@injectable()
export class VscodeConnector<TDocument extends vscode.CustomDocument = vscode.CustomDocument> implements vscode.Disposable {
    protected readonly clientDisposables = new Map<string, DisposableCollection>();
    protected readonly toDispose = new DisposableCollection();
    protected disposed = false;

    constructor(
        @inject(TYPES.ClientManager) protected readonly clientManager: ClientManager<TDocument>,
        @inject(TYPES.ActionRouter) protected readonly actionRouter: ActionRouter<TDocument>,
        @inject(TYPES.ActionDispatcher) protected readonly actionDispatcher: ActionDispatcher<TDocument>,
        @inject(TYPES.DocumentManager) protected readonly documentManager: DocumentManager<TDocument>,
        @inject(TYPES.VscodeContributionLifecycle) protected readonly lifecycle: VscodeContributionLifecycle,
        @inject(TYPES.GlspVscodeServer) @optional() protected readonly server?: GlspVscodeServer,
        @multiInject(TYPES.MessagePropagationFilter)
        @optional()
        protected readonly messagePropagationFilters: VscodeMessagePropagationFilter[] = [],
        @multiInject(TYPES.ClientRegistrationContribution)
        @optional()
        protected readonly clientRegistrationContributions: ClientRegistrationContribution<TDocument>[] = []
    ) {
        if (this.server) {
            this.toDispose.push(this.server.onServerMessage(message => this.onServerMessage(message)));
        }

        this.toDispose.push(
            this.clientManager.onDidDispose(client => {
                this.clientDisposables.get(client.clientId)?.dispose();
                this.clientDisposables.delete(client.clientId);
            })
        );
    }

    get clients(): readonly GlspVscodeClient<TDocument>[] {
        return this.clientManager.clients;
    }

    get activeClient(): GlspVscodeClient<TDocument> | undefined {
        return this.clientManager.activeClient;
    }

    get onDidRegister(): vscode.Event<GlspVscodeClient<TDocument>> {
        return this.clientManager.onDidRegister;
    }

    get onDidDispose(): vscode.Event<GlspVscodeClient<TDocument>> {
        return this.clientManager.onDidDispose;
    }

    get onDidChangeCustomDocument():
        | vscode.Event<vscode.CustomDocumentEditEvent<TDocument>>
        | vscode.Event<vscode.CustomDocumentContentChangeEvent<TDocument>> {
        return this.documentManager.onDidChangeCustomDocument;
    }

    async registerClient(client: GlspVscodeClient<TDocument>, options: RegisterClientOptions = {}): Promise<void> {
        if (!this.server) {
            throw new Error('VscodeConnector.registerClient failed: no GlspVscodeServer is bound.');
        }

        const clientDisposables = new DisposableCollection();
        this.clientDisposables.set(client.clientId, clientDisposables);
        this.clientManager.register(client, { managePanelLifecycle: options.managePanelLifecycle });

        try {
            clientDisposables.push(client.webviewEndpoint.onActionMessage(message => this.onClientMessage(message)));

            for (const contribution of this.clientRegistrationContributions) {
                const disposable = contribution.onBeforeClientInitialize?.(client);
                if (disposable) {
                    clientDisposables.push(disposable);
                }
            }

            const glspClient = await this.server.glspClient;
            clientDisposables.push(client.webviewEndpoint.initialize(glspClient));
            clientDisposables.push(
                Disposable.create(() =>
                    glspClient.disposeClientSession({
                        clientSessionId: client.clientId,
                        args: options.disposeClientSessionArgs
                    })
                )
            );

            for (const contribution of this.clientRegistrationContributions) {
                const disposable = contribution.onClientRegistered?.(client);
                if (disposable) {
                    clientDisposables.push(disposable);
                }
            }
        } catch (error) {
            clientDisposables.dispose();
            this.clientDisposables.delete(client.clientId);
            this.clientManager.disposeClient(client.clientId);
            throw error;
        }
    }

    clientIdByDocument(document: TDocument): string | undefined {
        return this.clientManager.getClientId(document);
    }

    dispatchAction(action: Action, clientId?: string): boolean {
        return this.actionDispatcher.dispatch(action, clientId);
    }

    processMessage(message: unknown, origin: MessageOrigin): MessageProcessingResult {
        const client = ActionMessage.is(message) ? this.clientManager.getClient(message.clientId) : undefined;
        return this.actionRouter.processMessage(message, client, origin);
    }

    saveDocument(document: TDocument, destination?: vscode.Uri): Promise<void> {
        return this.documentManager.saveDocument(document, destination);
    }

    revertDocument(document: TDocument, diagramType: string): Promise<void> {
        return this.documentManager.revertDocument(document, diagramType);
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.toDispose.dispose();
        this.clientDisposables.forEach(disposables => disposables.dispose());
        this.clientDisposables.clear();
        this.lifecycle.dispose();
    }

    protected onServerMessage(message: unknown): void {
        const { processedMessage } = this.processMessage(message, 'server');
        const filteredMessage = this.filterMessage(processedMessage, 'server');
        if (typeof filteredMessage !== 'undefined' && ActionMessage.is(filteredMessage)) {
            this.sendMessageToClient(filteredMessage.clientId, filteredMessage);
        }
    }

    protected onClientMessage(message: unknown): void {
        const { processedMessage } = this.processMessage(message, 'client');
        const filteredMessage = this.filterMessage(processedMessage, 'client');
        if (typeof filteredMessage !== 'undefined') {
            this.server?.onSendToServerEmitter.fire(filteredMessage);
        }
    }

    protected sendMessageToClient(clientId: string, message: unknown): void {
        const client = this.clientManager.getClient(clientId);
        if (client && ActionMessage.is(message)) {
            client.webviewEndpoint.sendMessage(message);
        }
    }

    protected filterMessage(message: unknown, origin: MessageOrigin): unknown | undefined {
        let filteredMessage: unknown | undefined = message;
        for (const filter of this.messagePropagationFilters) {
            if (typeof filteredMessage === 'undefined') {
                break;
            }
            filteredMessage = filter.filter(filteredMessage, origin);
        }
        return filteredMessage;
    }
}
