/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { Disposable, WebviewEndpoint, WebviewEndpointOptions } from '@eclipse-glsp/vscode-integration';

export type VscodeWebviewEndpoint = WebviewEndpoint;

export interface WebviewEndpointFactory {
    create(options: WebviewEndpointOptions): VscodeWebviewEndpoint;
}

export interface WebviewEndpointContribution {
    onEndpointInitialized(endpoint: VscodeWebviewEndpoint): Disposable | void;
}
