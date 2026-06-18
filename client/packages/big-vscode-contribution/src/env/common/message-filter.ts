/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { MessageOrigin } from './message-routing.js';

export interface VscodeMessagePropagationFilter {
    filter(message: unknown, origin: MessageOrigin): unknown | undefined;
}
