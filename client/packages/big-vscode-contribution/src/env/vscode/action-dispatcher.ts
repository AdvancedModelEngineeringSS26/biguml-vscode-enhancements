/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { RequestAction, ResponseAction, type Action } from '@eclipse-glsp/protocol';
import { Deferred, DisposableCollection, type ActionMessage, type GlspVscodeServer } from '@eclipse-glsp/vscode-integration';
import { inject, injectable, optional } from 'inversify';
import type * as vscode from 'vscode';
import { TYPES } from '../common/types.js';
import type { ActionListener } from './action-listener.js';
import type { ClientManager } from './client-manager.js';
import type { HandledActionRegistry } from './handled-action-registry.js';

interface PendingRequest {
    clientId: string;
    deferred: Deferred<ActionMessage<any>>;
}

@injectable()
export class ActionDispatcher<TDocument extends vscode.CustomDocument = vscode.CustomDocument> implements vscode.Disposable {
    protected readonly requests = new Map<string, PendingRequest>();
    protected readonly toDispose = new DisposableCollection();

    constructor(
        @inject(TYPES.ClientManager) protected readonly clientManager: ClientManager<TDocument>,
        @inject(TYPES.ActionListener) protected readonly actionListener: ActionListener,
        @inject(TYPES.HandledActionRegistry) protected readonly handledActionRegistry: HandledActionRegistry,
        @inject(TYPES.GlspVscodeServer) @optional() protected readonly server?: GlspVscodeServer
    ) {
        this.toDispose.push(
            this.actionListener.onClientAction(message => this.onActionMessage(message)),
            this.actionListener.onServerAction(message => this.onActionMessage(message)),
            this.actionListener.onVscodeAction(message => this.onActionMessage(message)),
            this.clientManager.onDidDispose(client =>
                this.rejectPendingRequestsForClient(
                    client.clientId,
                    new Error(`GLSP client ${client.clientId} was disposed before pending requests received a response.`)
                )
            )
        );
    }

    dispatch(actionOrActions: Action | readonly Action[], clientId?: string): boolean {
        if (Array.isArray(actionOrActions)) {
            return actionOrActions.reduce((dispatched, currentAction) => this.dispatch(currentAction, clientId) || dispatched, false);
        }

        const client = clientId ? this.clientManager.getClient(clientId) : this.clientManager.activeClient;
        if (!client) {
            console.warn('ActionDispatcher.dispatch skipped: no active or matching client found.', actionOrActions);
            return false;
        }

        const action = actionOrActions as Action;
        const message = {
            clientId: client.clientId,
            action
        };

        let dispatched = false;

        if (client.webviewEndpoint.clientActions?.includes(action.kind)) {
            client.webviewEndpoint.sendMessage(message as ActionMessage);
            dispatched = true;
        }

        if (client.webviewEndpoint.serverActions?.includes(action.kind) && this.server) {
            this.server.onSendToServerEmitter.fire(message);
            dispatched = true;
        }

        if (!dispatched && this.handledActionRegistry.has(action.kind)) {
            this.actionListener.emitVscodeAction(message as ActionMessage);
            dispatched = true;
        }

        return dispatched;
    }

    dispatchToClient(actionOrActions: Action | readonly Action[], clientId?: string): boolean {
        if (Array.isArray(actionOrActions)) {
            return actionOrActions.reduce(
                (dispatched, currentAction) => this.dispatchToClient(currentAction, clientId) || dispatched,
                false
            );
        }

        const client = clientId ? this.clientManager.getClient(clientId) : this.clientManager.activeClient;
        if (!client) {
            console.warn('ActionDispatcher.dispatchToClient skipped: no active or matching client found.', actionOrActions);
            return false;
        }

        client.webviewEndpoint.sendMessage({
            clientId: client.clientId,
            action: actionOrActions
        } as ActionMessage);

        return true;
    }

    dispatchToServer(actionOrActions: Action | readonly Action[], clientId?: string): boolean {
        if (Array.isArray(actionOrActions)) {
            return actionOrActions.reduce(
                (dispatched, currentAction) => this.dispatchToServer(currentAction, clientId) || dispatched,
                false
            );
        }

        const client = clientId ? this.clientManager.getClient(clientId) : this.clientManager.activeClient;
        if (!client) {
            console.warn('ActionDispatcher.dispatchToServer skipped: no active or matching client found.', actionOrActions);
            return false;
        }

        if (!this.server) {
            console.warn('ActionDispatcher.dispatchToServer skipped: no GLSP server is available.', actionOrActions);
            return false;
        }

        this.server.onSendToServerEmitter.fire({
            clientId: client.clientId,
            action: actionOrActions
        });

        return true;
    }

    broadcast(actionOrActions: Action | readonly Action[]): boolean {
        return this.clientManager.clients.reduce(
            (dispatched, client) => this.dispatch(actionOrActions, client.clientId) || dispatched,
            false
        );
    }

    async request<TResponse extends ResponseAction>(
        action: RequestAction<TResponse>,
        clientId?: string
    ): Promise<ActionMessage<TResponse>> {
        const client = clientId ? this.clientManager.getClient(clientId) : this.clientManager.activeClient;
        if (!client) {
            throw new Error(`ActionDispatcher.request failed: no active or matching client found for request action ${action.kind}.`);
        }

        while (!action.requestId || action.requestId === '' || this.requests.has(this.requestKey(client.clientId, action.requestId))) {
            action.requestId = RequestAction.generateRequestId();
        }

        const deferred = new Deferred<ActionMessage<TResponse>>();
        const requestKey = this.requestKey(client.clientId, action.requestId);
        this.requests.set(requestKey, {
            clientId: client.clientId,
            deferred: deferred as unknown as Deferred<ActionMessage<any>>
        });

        const dispatched = this.dispatch(action, client.clientId);
        if (!dispatched) {
            this.requests.delete(requestKey);
            throw new Error(`ActionDispatcher.request failed: could not dispatch request action ${action.kind}.`);
        }

        return deferred.promise;
    }

    dispose(): void {
        this.toDispose.dispose();
        this.rejectPendingRequests(new Error('ActionDispatcher disposed before pending requests received a response.'));
    }

    protected rejectPendingRequests(reason: Error): void {
        for (const pendingRequest of this.requests.values()) {
            pendingRequest.deferred.reject(reason);
        }
        this.requests.clear();
    }

    protected rejectPendingRequestsForClient(clientId: string, reason: Error): void {
        for (const [requestKey, pendingRequest] of this.requests.entries()) {
            if (pendingRequest.clientId === clientId) {
                pendingRequest.deferred.reject(reason);
                this.requests.delete(requestKey);
            }
        }
    }

    protected onActionMessage(message: ActionMessage): void {
        if (!ResponseAction.is(message.action)) {
            return;
        }

        const requestKey = this.requestKey(message.clientId, message.action.responseId);
        const pendingRequest = this.requests.get(requestKey);
        if (pendingRequest) {
            this.requests.delete(requestKey);
            pendingRequest.deferred.resolve(message);
        }
    }

    protected requestKey(clientId: string, requestId: string): string {
        return `${clientId}:${requestId}`;
    }
}
