/**********************************************************************************
 * Copyright (c) 2025 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { TYPES as CONTRIBUTION_TYPES } from '@borkdominik-biguml/big-vscode-contribution';
import type { ActionDispatcher, ClientManager } from '@borkdominik-biguml/big-vscode-contribution/vscode';
import { Action, RequestAction, type ActionMessage, type ResponseAction } from '@eclipse-glsp/protocol';
import { DisposableCollection, type Disposable } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import * as vscode from 'vscode';
import type { NotificationType } from 'vscode-messenger-common';
import { ActionWebviewProtocol } from '../../../../common/index.js';
import { TYPES } from '../../../vscode-common.types.js';
import { type WebviewMessenger } from './webview-messenger.js';

@injectable()
export class ActionWebviewMessenger implements Disposable {
    protected readonly toDispose = new DisposableCollection();

    protected readonly onActionMessageEmitter = new vscode.EventEmitter<ActionMessage>();
    readonly onActionMessage = this.onActionMessageEmitter.event;

    @inject(TYPES.WebviewMessenger)
    protected readonly messenger: WebviewMessenger;

    @inject(CONTRIBUTION_TYPES.ClientManager)
    protected readonly clientManager: ClientManager;

    @inject(CONTRIBUTION_TYPES.ActionDispatcher)
    protected readonly actionDispatcher: ActionDispatcher;

    resolve(): void {
        this.toDispose.push(
            this.messenger.onNotification(ActionWebviewProtocol.Message, message =>
                this.onActionMessageEmitter.fire(this.withClientId(message))
            ),
            this.messenger.onRequest(ActionWebviewProtocol.Request, message => this.request(message))
        );
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    sendNotification<P>(type: NotificationType<P>, payload: P): void {
        this.messenger.sendNotification(type, payload);
    }

    async request(message: ActionMessage): Promise<ActionMessage> {
        const actionMessage = this.withClientId(message);

        if (!RequestAction.is(actionMessage.action)) {
            throw new Error(`Cannot send non-request action '${actionMessage.action.kind}' through ActionWebviewProtocol.Request.`);
        }

        if (!actionMessage.clientId) {
            throw new Error(`Cannot send request action '${actionMessage.action.kind}' without an active client.`);
        }

        const response = await this.actionDispatcher.request<ResponseAction>(actionMessage.action, actionMessage.clientId);
        return response;
    }

    protected withClientId(message: ActionMessage): ActionMessage {
        return {
            ...message,
            clientId: message.clientId || this.clientManager.activeClient?.clientId || ''
        };
    }

    dispatch(message: Action | ActionMessage | ActionMessage[]): void {
        if (Action.is(message)) {
            this.messenger.sendNotification(ActionWebviewProtocol.Message, {
                action: message,
                clientId: this.clientManager.activeClient?.clientId ?? ''
            });
            return;
        }

        if (Array.isArray(message)) {
            for (const msg of message) {
                this.messenger.sendNotification(ActionWebviewProtocol.Message, msg);
            }
        } else {
            this.messenger.sendNotification(ActionWebviewProtocol.Message, message);
        }
    }
}
