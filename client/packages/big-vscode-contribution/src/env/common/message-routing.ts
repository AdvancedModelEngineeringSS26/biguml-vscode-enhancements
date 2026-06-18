/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

export const MESSAGE_ORIGINS = ['client', 'server'] as const;

export type MessageOrigin = (typeof MESSAGE_ORIGINS)[number];

export interface MessageProcessingResult {
    readonly processedMessage: unknown;
    readonly messageChanged: boolean;
}

export interface SelectionState {
    readonly selectedElementsIDs: readonly string[];
    readonly deselectedElementsIDs: readonly string[];
}

export function unchangedMessage(message: unknown): MessageProcessingResult {
    return {
        processedMessage: message,
        messageChanged: false
    };
}
