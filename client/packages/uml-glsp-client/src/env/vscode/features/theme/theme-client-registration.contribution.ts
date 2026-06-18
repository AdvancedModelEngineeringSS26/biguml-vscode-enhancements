/*********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 *********************************************************************************/
import type { ClientRegistrationContribution } from '@borkdominik-biguml/big-vscode-contribution/vscode';
import { type GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import { GLSPIsReadyAction } from '../../../common/actions/editor.actions.js';
import { TYPES } from '@borkdominik-biguml/big-vscode/vscode';
import type { ThemeIntegration } from './theme-integration.js';

@injectable()
export class ThemeClientRegistrationContribution implements ClientRegistrationContribution {
    constructor(@inject(TYPES.Theme) protected readonly themeIntegration: ThemeIntegration) {}

    onBeforeClientInitialize(client: GlspVscodeClient) {
        return client.webviewEndpoint.onActionMessage(message => {
            if (GLSPIsReadyAction.is(message.action)) {
                this.themeIntegration.updateTheme(client);
            }
        });
    }
}
