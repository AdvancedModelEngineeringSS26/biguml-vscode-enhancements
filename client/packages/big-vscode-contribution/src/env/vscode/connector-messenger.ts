/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { injectable } from 'inversify';
import { Messenger } from 'vscode-messenger';

/**
 * Owns the shared messenger used by the contribution-native VS Code connector
 * runtime. This replaces the compatibility connector as the owner of the
 * extension host messenger instance.
 */
@injectable()
export class ConnectorMessenger {
    readonly messenger = new Messenger({ ignoreHiddenViews: false });
}
