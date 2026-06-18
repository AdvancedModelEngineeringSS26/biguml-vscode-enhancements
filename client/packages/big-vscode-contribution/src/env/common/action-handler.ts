/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { ActionMessage, GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import type * as vscode from 'vscode';
import type { MessageOrigin, MessageProcessingResult } from './message-routing.js';

export interface VscodeActionHandler<TDocument extends vscode.CustomDocument = vscode.CustomDocument> {
    readonly actionKinds: readonly string[];
    handle(
        message: ActionMessage,
        client: GlspVscodeClient<TDocument> | undefined,
        origin: MessageOrigin
    ): MessageProcessingResult;
}
