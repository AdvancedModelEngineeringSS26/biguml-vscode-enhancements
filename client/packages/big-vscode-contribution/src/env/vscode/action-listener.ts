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
    DisposableCollection,
    type ActionMessage,
    type Disposable,
    type MaybePromise,
    type RequestAction,
    type ResponseAction
} from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import * as vscode from 'vscode';
import { TYPES } from '../common/types.js';
import type { ActionDispatcher } from './action-dispatcher.js';
import type { HandledActionRegistry } from './handled-action-registry.js';

@injectable()
export class ActionListener implements vscode.Disposable {
    protected readonly onClientActionEmitter = new vscode.EventEmitter<ActionMessage>();
    readonly onClientAction = this.onClientActionEmitter.event;

    protected readonly onServerActionEmitter = new vscode.EventEmitter<ActionMessage>();
    readonly onServerAction = this.onServerActionEmitter.event;

    protected readonly onVscodeActionEmitter = new vscode.EventEmitter<ActionMessage>();
    readonly onVscodeAction = this.onVscodeActionEmitter.event;

    emitClientAction(message: ActionMessage): void {
        this.onClientActionEmitter.fire(message);
    }

    emitServerAction(message: ActionMessage): void {
        this.onServerActionEmitter.fire(message);
    }

    emitVscodeAction(message: ActionMessage): void {
        this.onVscodeActionEmitter.fire(message);
    }

    registerListener(callback: (action: ActionMessage) => void): Disposable {
        return this.onClientAction(callback);
    }

    registerServerListener(callback: (action: ActionMessage) => void): Disposable {
        return this.onServerAction(callback);
    }

    registerVSCodeListener(callback: (action: ActionMessage) => void): Disposable {
        return this.onVscodeAction(callback);
    }

    on<TAction extends Action = Action>(
        actionKind: string,
        handler: (message: ActionMessage<TAction>, action: TAction, clientId: string) => void
    ): Disposable {
        const toDispose = new DisposableCollection();

        const listener = (message: ActionMessage): void => {
            if (message.action.kind === actionKind) {
                handler(message as ActionMessage<TAction>, message.action as TAction, message.clientId);
            }
        };

        toDispose.push(this.onClientAction(listener), this.onServerAction(listener), this.onVscodeAction(listener));
        return toDispose;
    }

    onClient<TAction extends Action = Action>(
        actionKind: string,
        handler: (message: ActionMessage<TAction>, action: TAction, clientId: string) => void
    ): Disposable {
        return this.onClientAction(message => {
            if (message.action.kind === actionKind) {
                handler(message as ActionMessage<TAction>, message.action as TAction, message.clientId);
            }
        });
    }

    onServer<TAction extends Action = Action>(
        actionKind: string,
        handler: (message: ActionMessage<TAction>, action: TAction, clientId: string) => void
    ): Disposable {
        return this.onServerAction(message => {
            if (message.action.kind === actionKind) {
                handler(message as ActionMessage<TAction>, message.action as TAction, message.clientId);
            }
        });
    }

    onVSCode<TAction extends Action = Action>(
        actionKind: string,
        handler: (message: ActionMessage<TAction>, action: TAction, clientId: string) => void
    ): Disposable {
        return this.onVscodeAction(message => {
            if (message.action.kind === actionKind) {
                handler(message as ActionMessage<TAction>, message.action as TAction, message.clientId);
            }
        });
    }

    createCache(cachedActionKinds: string[]): CacheActionListener {
        return new CacheActionListener(this, cachedActionKinds);
    }

    dispose(): void {
        this.onClientActionEmitter.dispose();
        this.onServerActionEmitter.dispose();
        this.onVscodeActionEmitter.dispose();
    }
}

@injectable()
export class ActionRequestHandlerRegistry implements vscode.Disposable {
    constructor(
        @inject(TYPES.ActionListener) protected readonly actionListener: ActionListener,
        @inject(TYPES.ActionDispatcher) protected readonly actionDispatcher: ActionDispatcher,
        @inject(TYPES.HandledActionRegistry) protected readonly handledActionRegistry: HandledActionRegistry
    ) {}

    handleGLSPRequest<TRequest extends RequestAction<ResponseAction>, TResponse extends ResponseAction = ResponseAction>(
        kind: TRequest['kind'],
        handler: (action: ActionMessage<TRequest>) => MaybePromise<TResponse>
    ): Disposable {
        const toDispose = new DisposableCollection();
        toDispose.push(
            this.handledActionRegistry.register(kind),
            this.actionListener.registerListener(message => {
                if (message.action.kind === kind) {
                    void this.dispatchHandledResponse(handler, message as ActionMessage<TRequest>, 'client');
                }
            })
        );
        return toDispose;
    }

    handleClientRequest<TRequest extends RequestAction<ResponseAction>, TResponse extends ResponseAction = ResponseAction>(
        kind: TRequest['kind'],
        handler: (action: ActionMessage<TRequest>) => MaybePromise<TResponse>
    ): Disposable {
        return this.handleGLSPRequest(kind, handler);
    }

    handleVSCodeRequest<TRequest extends RequestAction<ResponseAction>, TResponse extends ResponseAction = ResponseAction>(
        kind: TRequest['kind'],
        handler: (action: ActionMessage<TRequest>) => MaybePromise<TResponse>
    ): Disposable {
        const toDispose = new DisposableCollection();
        toDispose.push(
            this.handledActionRegistry.register(kind),
            this.actionListener.registerVSCodeListener(message => {
                if (message.action.kind === kind) {
                    void this.dispatchHandledResponse(handler, message as ActionMessage<TRequest>, 'vscode');
                }
            })
        );
        return toDispose;
    }

    handleRequest<TRequest extends RequestAction<ResponseAction>, TResponse extends ResponseAction = ResponseAction>(
        kind: TRequest['kind'],
        handler: (action: ActionMessage<TRequest>) => MaybePromise<TResponse>
    ): Disposable {
        return this.handleVSCodeRequest(kind, handler);
    }

    dispose(): void {
        // Registration state is owned by the returned disposables.
    }

    protected async dispatchHandledResponse<TRequest extends RequestAction<ResponseAction>, TResponse extends ResponseAction>(
        handler: (action: ActionMessage<TRequest>) => MaybePromise<TResponse>,
        message: ActionMessage<TRequest>,
        source: 'client' | 'vscode'
    ): Promise<void> {
        const response = await handler(message);
        response.responseId = message.action.requestId;

        if (source === 'vscode') {
            this.actionListener.emitVscodeAction({
                clientId: message.clientId,
                action: response
            });
            return;
        }

        this.actionDispatcher.dispatch(response, message.clientId);
    }
}

export class CacheActionListener implements vscode.Disposable {
    protected readonly toDispose = new DisposableCollection();
    protected readonly cache: Record<string, ActionMessage> = {};

    protected readonly onDidChangeEmitter = new vscode.EventEmitter<ActionMessage>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(
        protected readonly actionListener: ActionListener,
        protected readonly cachedActionKinds: string[]
    ) {
        this.toDispose.push(
            this.actionListener.registerListener(message => {
                if (this.cachedActionKinds.includes(message.action.kind)) {
                    this.cache[message.action.kind] = message;
                    this.onDidChangeEmitter.fire(message);
                }
            })
        );
    }

    getAction(kind: string): ActionMessage | undefined {
        return this.cache[kind];
    }

    getActions(): ActionMessage[] {
        return Object.values(this.cache);
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
