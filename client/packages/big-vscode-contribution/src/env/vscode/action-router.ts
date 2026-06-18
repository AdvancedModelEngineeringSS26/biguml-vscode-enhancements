/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { ActionMessage, GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { ActionMessage as GlspActionMessage } from '@eclipse-glsp/vscode-integration';
import { inject, injectable, multiInject, optional } from 'inversify';
import type * as vscode from 'vscode';
import type { VscodeActionHandler } from '../common/action-handler.js';
import type { MessageOrigin, MessageProcessingResult } from '../common/message-routing.js';
import { unchangedMessage } from '../common/message-routing.js';
import { TYPES } from '../common/types.js';
import type { ActionListener } from './action-listener.js';

@injectable()
export class ActionRouter<TDocument extends vscode.CustomDocument = vscode.CustomDocument> {
    constructor(
        @multiInject(TYPES.VscodeActionHandler) @optional()
        protected readonly handlers: VscodeActionHandler<TDocument>[] = [],
        @inject(TYPES.ActionListener) @optional()
        protected readonly actionListener?: ActionListener
    ) {}

    processMessage(
        message: unknown,
        client: GlspVscodeClient<TDocument> | undefined,
        origin: MessageOrigin
    ): MessageProcessingResult {
        if (!GlspActionMessage.is(message)) {
            return unchangedMessage(message);
        }

        this.emitObservedMessage(message, origin);

        const matchingHandler = this.resolveHandler(message.action.kind);
        if (!matchingHandler) {
            return unchangedMessage(message);
        }

        return matchingHandler.handle(message, client, origin);
    }

    protected emitObservedMessage(message: ActionMessage, origin: MessageOrigin): void {
        if (!this.actionListener) {
            return;
        }

        switch (origin) {
            case 'client':
                this.actionListener.emitClientAction(message);
                return;
            case 'server':
                this.actionListener.emitServerAction(message);
                return;
        }
    }

    protected resolveHandler(actionKind: string): VscodeActionHandler<TDocument> | undefined {
        const matchingHandlers = this.handlers.filter(handler => handler.actionKinds.includes(actionKind));
        if (matchingHandlers.length <= 1) {
            return matchingHandlers[0];
        }

        throw new Error(
            `ActionRouter.processMessage found multiple handlers for action kind "${actionKind}": ${matchingHandlers
                .map(handler => handler.constructor.name)
                .join(', ')}`
        );
    }
}
