/**********************************************************************************
 * Copyright (c) 2025 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { TYPES as CONTRIBUTION_TYPES } from '@borkdominik-biguml/big-vscode-contribution';
import { TYPES } from '../../vscode-common.types.js';
import { VscodeFeatureModule } from '../container/container.js';
import { ConnectionManager } from './connection-manager.js';
import { BigVscodeMessagePropagationFilter } from './glsp-vscode-connector.js';
import { SelectionService } from './selection-service.js';

export const connectorModule = new VscodeFeatureModule(context => {
    context.bind(CONTRIBUTION_TYPES.GlspVscodeServer).toDynamicValue(bindingContext => bindingContext.container.get(TYPES.GlspServer));
    context.bind(CONTRIBUTION_TYPES.MessagePropagationFilter).to(BigVscodeMessagePropagationFilter).inSingletonScope();
    context.bind(TYPES.OnDispose).toService(CONTRIBUTION_TYPES.VscodeConnector);

    context.bind(TYPES.ConnectionManager).to(ConnectionManager).inSingletonScope();
    context.bind(TYPES.SelectionService).to(SelectionService).inSingletonScope();
    context.bind(TYPES.OnDispose).toService(TYPES.ConnectionManager);
    context.bind(TYPES.OnDispose).toService(TYPES.SelectionService);
});
