/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { MessageAction } from '@eclipse-glsp/protocol';
import type { ActionMessage, GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { injectable } from 'inversify';
import * as vscode from 'vscode';
import type { VscodeActionHandler } from '../common/action-handler.js';
import type { MessageOrigin, MessageProcessingResult } from '../common/message-routing.js';

@injectable()
export class MessageHandler<TDocument extends vscode.CustomDocument = vscode.CustomDocument>
    implements VscodeActionHandler<TDocument>
{
    readonly actionKinds = [MessageAction.KIND] as const;

    handle(
        message: ActionMessage,
        _client: GlspVscodeClient<TDocument> | undefined,
        _origin: MessageOrigin
    ): MessageProcessingResult {
        if (!MessageAction.is(message.action)) {
            return {
                processedMessage: message,
                messageChanged: false
            };
        }

        const action = message.action;
        switch (action.severity) {
            case 'ERROR':
                void vscode.window.showErrorMessage(action.message);
                break;
            case 'WARNING':
                void vscode.window.showWarningMessage(action.message);
                break;
            case 'INFO':
                void vscode.window.showInformationMessage(action.message);
                break;
            default:
                break;
        }

        return {
            processedMessage: undefined,
            messageChanged: true
        };
    }
}
