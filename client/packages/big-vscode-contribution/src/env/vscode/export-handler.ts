/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { ExportSvgAction } from '@eclipse-glsp/protocol';
import type { ActionMessage, GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { injectable } from 'inversify';
import * as vscode from 'vscode';
import type { VscodeActionHandler } from '../common/action-handler.js';
import type { MessageOrigin, MessageProcessingResult } from '../common/message-routing.js';

@injectable()
export class ExportHandler<TDocument extends vscode.CustomDocument = vscode.CustomDocument>
    implements VscodeActionHandler<TDocument>
{
    readonly actionKinds = [ExportSvgAction.KIND] as const;

    handle(
        message: ActionMessage,
        _client: GlspVscodeClient<TDocument> | undefined,
        _origin: MessageOrigin
    ): MessageProcessingResult {
        if (!ExportSvgAction.is(message.action)) {
            return {
                processedMessage: message,
                messageChanged: false
            };
        }

        const action = message.action;
        void vscode.window
            .showSaveDialog({
                filters: { SVG: ['svg'] },
                saveLabel: 'Export',
                title: 'Export as SVG'
            })
            .then(uri => {
                if (!uri) {
                    return;
                }
                const content = new TextEncoder().encode(action.svg);
                return vscode.workspace.fs.writeFile(uri, content).then(undefined, error => {
                    console.error(error);
                });
            }, error => {
                console.error(error);
            });

        return {
            processedMessage: undefined,
            messageChanged: true
        };
    }
}
