/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { ActionMessage } from '@eclipse-glsp/vscode-integration';
import type { NotificationType, RequestType } from 'vscode-messenger-common';

export namespace ActionWebviewProtocol {
    export const Message: NotificationType<ActionMessage> = { method: 'action/message' };

    /**
     * Request-capable counterpart to `Message`.
     *
     * This allows sidebar webviews to ask the extension host to dispatch a GLSP
     * request via the native `ActionDispatcher.request(...)` pipeline and receive
     * the correlated response directly through vscode-messenger.
     */
    export const Request: RequestType<ActionMessage, ActionMessage> = { method: 'action/request' };
}
