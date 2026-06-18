/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { RedoAction, SetDirtyStateAction, UndoAction } from '@eclipse-glsp/protocol';
import type { ActionMessage, GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import type * as vscode from 'vscode';
import type { VscodeActionHandler } from '../common/action-handler.js';
import type { MessageOrigin, MessageProcessingResult } from '../common/message-routing.js';
import { TYPES } from '../common/types.js';
import type { ActionDispatcher } from './action-dispatcher.js';
import type { DocumentManager } from './document-manager.js';

@injectable()
export class DirtyStateHandler<TDocument extends vscode.CustomDocument = vscode.CustomDocument>
    implements VscodeActionHandler<TDocument>
{
    readonly actionKinds = [SetDirtyStateAction.KIND] as const;

    protected readonly initializedClients = new Set<string>();

    constructor(
        @inject(TYPES.DocumentManager) protected readonly documentManager: DocumentManager<TDocument>,
        @inject(TYPES.ActionDispatcher) protected readonly actionDispatcher: ActionDispatcher<TDocument>
    ) {}

    handle(
        message: ActionMessage,
        client: GlspVscodeClient<TDocument> | undefined,
        _origin: MessageOrigin
    ): MessageProcessingResult {
        if (!client || !SetDirtyStateAction.is(message.action)) {
            return {
                processedMessage: message,
                messageChanged: true
            };
        }

        const { action } = message;
        const reason = action.reason;

        if (reason === 'save') {
            this.initializedClients.add(client.clientId);
            this.documentManager.notifyDocumentSaved(client.clientId, client.document);
        } else if (reason === 'operation' && action.isDirty) {
            if (this.initializedClients.has(client.clientId)) {
                this.documentManager.notifyDocumentEdit({
                    document: client.document,
                    undo: () => {
                        this.actionDispatcher.dispatch(UndoAction.create(), client.clientId);
                    },
                    redo: () => {
                        this.actionDispatcher.dispatch(RedoAction.create(), client.clientId);
                    }
                });
            }
        } else if (!action.isDirty) {
            this.initializedClients.add(client.clientId);
            if (reason === 'undo' || reason === 'redo') {
                this.documentManager.notifyDocumentSaved(client.clientId, client.document);
            }
        }

        return {
            processedMessage: message,
            messageChanged: true
        };
    }
}
