/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { SelectAction } from '@eclipse-glsp/protocol';
import type { ActionMessage, GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import type * as vscode from 'vscode';
import type { VscodeActionHandler } from '../common/action-handler.js';
import type { MessageOrigin, MessageProcessingResult, SelectionState } from '../common/message-routing.js';
import { unchangedMessage } from '../common/message-routing.js';
import { TYPES } from '../common/types.js';
import type { SelectionTracker } from './selection-tracker.js';

@injectable()
export class SelectionHandler<TDocument extends vscode.CustomDocument = vscode.CustomDocument>
    implements VscodeActionHandler<TDocument>
{
    readonly actionKinds = [SelectAction.KIND] as const;

    constructor(@inject(TYPES.SelectionTracker) protected readonly selectionTracker: SelectionTracker<TDocument>) {}

    handle(
        message: ActionMessage,
        client: GlspVscodeClient<TDocument> | undefined,
        origin: MessageOrigin
    ): MessageProcessingResult {
        if (!client || !SelectAction.is(message.action)) {
            return unchangedMessage(message);
        }

        const selection: SelectionState = {
            selectedElementsIDs: message.action.selectedElementsIDs,
            deselectedElementsIDs: message.action.deselectedElementsIDs
        };
        this.selectionTracker.setSelection(client.clientId, selection);

        if (origin === 'client') {
            return {
                processedMessage: undefined,
                messageChanged: true
            };
        }

        return unchangedMessage(message);
    }
}
