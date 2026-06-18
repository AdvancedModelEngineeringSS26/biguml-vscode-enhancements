/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { ActionMessage } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import type { VscodeMessagePropagationFilter } from '../common/message-filter.js';
import type { MessageOrigin } from '../common/message-routing.js';
import { TYPES } from '../common/types.js';
import type { HandledActionRegistry } from './handled-action-registry.js';

/**
 * Prevents actions that are handled inside the extension host from being
 * forwarded to the GLSP server a second time.
 */
@injectable()
export class HandledActionMessageFilter implements VscodeMessagePropagationFilter {
    constructor(@inject(TYPES.HandledActionRegistry) protected readonly handledActions: HandledActionRegistry) {}

    filter(message: unknown, origin: MessageOrigin): unknown | undefined {
        if (origin !== 'client' || !ActionMessage.is(message)) {
            return message;
        }

        return this.handledActions.has(message.action.kind) ? undefined : message;
    }
}
