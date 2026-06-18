/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import {
    WebviewEndpoint,
    WebviewReadyNotification,
    type Disposable,
    type GLSPClient,
    type WebviewEndpointOptions
} from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import type { VscodeWebviewEndpoint } from '../common/webview-endpoint.js';

export const WEBVIEW_ENDPOINT_TYPES = {
    WebviewEndpointOptions: Symbol('WebviewEndpointOptions')
} as const;

@injectable()
export class InjectableWebviewEndpoint extends WebviewEndpoint implements VscodeWebviewEndpoint {
    protected initialized = false;
    protected hasSentDiagramIdentifier = false;

    constructor(@inject(WEBVIEW_ENDPOINT_TYPES.WebviewEndpointOptions) options: WebviewEndpointOptions) {
        super(options);

        this.toDispose.push(
            this.messenger.onNotification(
                WebviewReadyNotification,
                () => {
                    if (this.initialized && this.hasSentDiagramIdentifier && this._readyDeferred.state === 'resolved') {
                        void this.sendDiagramIdentifier();
                    }
                },
                {
                    sender: this.messageParticipant
                }
            )
        );
    }

    override initialize(glspClient: GLSPClient): Disposable {
        this.initialized = true;
        return super.initialize(glspClient);
    }

    trackDisposable(disposable: Disposable | void): void {
        if (disposable) {
            this.toDispose.push(disposable);
        }
    }

    protected override async sendDiagramIdentifier(): Promise<void> {
        await super.sendDiagramIdentifier();
        this.hasSentDiagramIdentifier = true;
    }
}
