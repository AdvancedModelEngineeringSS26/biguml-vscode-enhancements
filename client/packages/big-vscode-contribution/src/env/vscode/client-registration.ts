/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { Disposable, GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import type * as vscode from 'vscode';

/**
 * Contribution point for consumer-side client initialization.
 */
export interface ClientRegistrationContribution<TDocument extends vscode.CustomDocument = vscode.CustomDocument> {
    /**
     * Called after the client is registered with the connector, but before the
     * webview endpoint is initialized. Use this for listeners that must observe
     * startup messages emitted during endpoint initialization.
     */
    onBeforeClientInitialize?(client: GlspVscodeClient<TDocument>): Disposable | void;

    /**
     * Called after the webview endpoint has been initialized successfully.
     */
    onClientRegistered?(client: GlspVscodeClient<TDocument>): Disposable | void;
}
