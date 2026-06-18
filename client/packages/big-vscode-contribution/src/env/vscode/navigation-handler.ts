/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { NavigateToExternalTargetAction } from '@eclipse-glsp/protocol';
import type { ActionMessage, GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { injectable } from 'inversify';
import * as vscode from 'vscode';
import type { VscodeActionHandler } from '../common/action-handler.js';
import type { MessageOrigin, MessageProcessingResult } from '../common/message-routing.js';

@injectable()
export class NavigationHandler<TDocument extends vscode.CustomDocument = vscode.CustomDocument>
    implements VscodeActionHandler<TDocument>
{
    readonly actionKinds = [NavigateToExternalTargetAction.KIND] as const;

    handle(
        message: ActionMessage,
        _client: GlspVscodeClient<TDocument> | undefined,
        _origin: MessageOrigin
    ): MessageProcessingResult {
        if (!NavigateToExternalTargetAction.is(message.action)) {
            return {
                processedMessage: message,
                messageChanged: false
            };
        }

        const showOptionsKey = 'jsonOpenerOptions';
        const { uri, args } = message.action.target;
        const showOptionsField = args?.[showOptionsKey];
        let parsedShowOptions = {};
        if (typeof showOptionsField !== 'undefined') {
            try {
                parsedShowOptions =
                    typeof showOptionsField === 'string' ? JSON.parse(showOptionsField) : JSON.parse(String(showOptionsField));
            } catch (error) {
                console.warn('NavigationHandler.handle received invalid jsonOpenerOptions.', error);
            }
        }

        void vscode.window.showTextDocument(vscode.Uri.parse(uri), { ...args, ...parsedShowOptions }).then(
            () => undefined,
            () => undefined
        );

        return {
            processedMessage: undefined,
            messageChanged: true
        };
    }
}
