/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { WebviewEndpointOptions } from '@eclipse-glsp/vscode-integration';
import { Container, injectable } from 'inversify';
import { TYPES } from '../common/types.js';
import type { WebviewEndpointContribution, WebviewEndpointFactory, VscodeWebviewEndpoint } from '../common/webview-endpoint.js';
import { InjectableWebviewEndpoint, WEBVIEW_ENDPOINT_TYPES } from './webview-endpoint.js';

@injectable()
export class DefaultWebviewEndpointFactory implements WebviewEndpointFactory {
    /**
     * Creates endpoint-scoped webview endpoints for the contribution-native
     * connector runtime. New code should prefer this factory over direct
     * `WebviewEndpoint` construction.
     */
    constructor(protected readonly container: Container) {}

    create(options: WebviewEndpointOptions): VscodeWebviewEndpoint {
        const childContainer = new Container({ skipBaseClassChecks: true });
        childContainer.parent = this.container;
        childContainer.bind(WEBVIEW_ENDPOINT_TYPES.WebviewEndpointOptions).toConstantValue(options);
        childContainer.bind(InjectableWebviewEndpoint).toSelf().inTransientScope();

        const endpoint = childContainer.get(InjectableWebviewEndpoint);
        const contributions = this.container.isBound(TYPES.WebviewEndpointContribution)
            ? this.container.getAll<WebviewEndpointContribution>(TYPES.WebviewEndpointContribution)
            : [];
        for (const contribution of contributions) {
            endpoint.trackDisposable(contribution.onEndpointInitialized(endpoint));
        }
        return endpoint;
    }
}
