/*********************************************************************************
 * Copyright (c) 2023 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 *********************************************************************************/
import { TYPES as CONTRIBUTION_TYPES } from '@borkdominik-biguml/big-vscode-contribution';
import type {
    ActionDispatcher as ContributionActionDispatcher,
    ActionListener as ContributionActionListener,
    ClientManager as ContributionClientManager,
    ConnectorMessenger as ContributionConnectorMessenger,
    SelectionTracker as ContributionSelectionTracker,
    VscodeConnector as ContributionVscodeConnector
} from '@borkdominik-biguml/big-vscode-contribution/vscode';
import { type Action, ActionMessage, type Args, type GlspVscodeClient, type GlspVscodeServer, type SelectionState } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import type * as vscode from 'vscode';
import { VscodeAction } from '../../../common/vscode.action.js';
import { TYPES } from '../../vscode-common.types.js';

@injectable()
export class BigVscodeMessagePropagationFilter {
    filter(message: unknown, origin: 'client' | 'server'): unknown | undefined {
        if (origin !== 'client' || !ActionMessage.is(message)) {
            return message;
        }

        const action = message.action;
        if (VscodeAction.isExtensionOnly(action)) {
            return undefined;
        }

        return message;
    }
}

/**
 * Compatibility facade for the retained `big-vscode` connector surface.
 *
 * @deprecated Use the contribution runtime services from
 * `@borkdominik-biguml/big-vscode-contribution/vscode` for new code:
 * `VscodeConnector` for client registration and document lifecycle,
 * `ClientManager` for client lookup and active-client state,
 * `ActionDispatcher` for dispatching actions, and `ActionListener` for
 * observing client/server/VS Code actions.
 *
 * See `client/docs/feature1/compatibility-layer.md`.
 */
@injectable()
export class BigGlspVSCodeConnector<TDocument extends vscode.CustomDocument = vscode.CustomDocument> implements vscode.Disposable {
    constructor(
        @inject(TYPES.GlspServer) protected readonly glspServer: GlspVscodeServer,
        @inject(CONTRIBUTION_TYPES.VscodeConnector)
        protected readonly contributionConnector: ContributionVscodeConnector<TDocument>,
        @inject(CONTRIBUTION_TYPES.ClientManager)
        protected readonly clientManager: ContributionClientManager<TDocument>,
        @inject(CONTRIBUTION_TYPES.ActionDispatcher)
        protected readonly contributionActionDispatcher: ContributionActionDispatcher<TDocument>,
        @inject(CONTRIBUTION_TYPES.ActionListener)
        protected readonly contributionActionListener: ContributionActionListener,
        @inject(CONTRIBUTION_TYPES.ConnectorMessenger)
        protected readonly connectorMessenger: ContributionConnectorMessenger,
        @inject(CONTRIBUTION_TYPES.SelectionTracker)
        protected readonly contributionSelectionTracker: ContributionSelectionTracker
    ) {}

    get messenger() {
        return this.connectorMessenger.messenger;
    }

    get documents(): TDocument[] {
        return this.clients.map(client => client.document);
    }

    get clients(): GlspVscodeClient<TDocument>[] {
        return [...this.clientManager.clients];
    }

    get activeClient(): GlspVscodeClient<TDocument> | undefined {
        return this.clientManager.activeClient;
    }

    get onDidRegister(): vscode.Event<GlspVscodeClient<TDocument>> {
        return this.contributionConnector.onDidRegister;
    }

    get onDidDispose(): vscode.Event<GlspVscodeClient<TDocument>> {
        return this.contributionConnector.onDidDispose;
    }

    /**
     * @deprecated Use contribution `ActionListener.onServerAction` or
     * `ActionListener.registerServerListener(...)`.
     */
    get onServerActionMessage(): vscode.Event<any> {
        return this.contributionActionListener.onServerAction;
    }

    /**
     * @deprecated Use contribution `ActionListener.onClientAction` or
     * `ActionListener.registerListener(...)`.
     */
    get onClientActionMessage(): vscode.Event<any> {
        return this.contributionActionListener.onClientAction;
    }

    /**
     * @deprecated Use contribution `ActionListener.onVscodeAction` or
     * `ActionListener.registerVSCodeListener(...)`.
     */
    get onVSCodeActionMessage(): vscode.Event<any> {
        return this.contributionActionListener.onVscodeAction;
    }

    get onDidChangeCustomDocument():
        | vscode.Event<vscode.CustomDocumentEditEvent<TDocument>>
        | vscode.Event<vscode.CustomDocumentContentChangeEvent<TDocument>> {
        return this.contributionConnector.onDidChangeCustomDocument;
    }

    clientIdByDocument(document: TDocument): string | undefined {
        return this.contributionConnector.clientIdByDocument(document);
    }

    async registerClient(client: GlspVscodeClient<TDocument>): Promise<void> {
        await this.contributionConnector.registerClient(client, {
            disposeClientSessionArgs: this.disposeClientSessionArgs(client)
        });
    }

    /**
     * @deprecated Use contribution `ActionDispatcher.dispatch(action, clientId)`.
     */
    sendActionToActiveClient(action: Action): void {
        this.dispatchAction(action);
    }

    /**
     * @deprecated Use contribution `ActionDispatcher.dispatch(action, clientId)`
     * for routed actions. Use `client.webviewEndpoint.sendMessage(...)`
     * directly only when intentionally bypassing connector routing.
     */
    public sendActionToActiveServer(action: Action): void {
        this.clients.forEach(client => {
            if (client.webviewEndpoint.webviewPanel.active) {
                client.webviewEndpoint.sendMessage({
                    clientId: client.clientId,
                    action
                });
            }
        });
    }

    /**
     * @deprecated Use contribution `ActionDispatcher.dispatch(action, clientId)`
     * for routed actions or the GLSP server directly when intentionally bypassing
     * connector routing.
     */
    public sendActionToServer(clientId: string, action: Action): void {
        this.glspServer.onSendToServerEmitter.fire({
            clientId,
            action
        });
    }

    dispatchAction(action: Action, clientId?: string): void {
        const client = clientId ? this.clientManager.getClient(clientId) : this.activeClient;
        if (!client) {
            console.warn('Could not dispatch action: No client found for clientId or no active client found.', action);
            return;
        }

        const dispatched = this.contributionActionDispatcher.dispatch(action, client.clientId);
        if (!dispatched) {
            console.warn('Could not dispatch action. No handler found for action kind:', action.kind);
        }
    }

    getSelectionState(clientId?: string): SelectionState | undefined {
        const targetClientId = clientId ?? this.clientManager.activeClient?.clientId;
        if (!targetClientId) {
            return undefined;
        }
        return this.contributionSelectionTracker.getSelection(targetClientId) as SelectionState | undefined;
    }

    saveDocument(document: TDocument, destination?: vscode.Uri): Promise<void> {
        return this.contributionConnector.saveDocument(document, destination);
    }

    revertDocument(document: TDocument, diagramType: string): Promise<void> {
        return this.contributionConnector.revertDocument(document, diagramType);
    }

    dispose(): void {
        this.contributionConnector.dispose();
    }

    protected disposeClientSessionArgs(client: GlspVscodeClient<TDocument>): Args | undefined {
        const sourcePath = ((client.document as any).sourceUri as vscode.Uri | undefined)?.path ?? client.document.uri.path;
        return {
            sourceUri: sourcePath
        };
    }
}
