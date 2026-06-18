/*********************************************************************************
 * Copyright (c) 2023 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 *********************************************************************************/
import { TYPES as CONTRIBUTION_TYPES } from '@borkdominik-biguml/big-vscode-contribution';
import { bindLifecycle, TYPES, VscodeFeatureModule } from '@borkdominik-biguml/big-vscode/vscode';
import { ThemeIntegration } from './theme-integration.js';
import { ThemeClientRegistrationContribution } from './theme-client-registration.contribution.js';

export const themeModule = new VscodeFeatureModule(context => {
    bindLifecycle(context, TYPES.Theme, ThemeIntegration);
    context.bind(CONTRIBUTION_TYPES.ClientRegistrationContribution).to(ThemeClientRegistrationContribution).inSingletonScope();
});
