/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { Disposable } from '@eclipse-glsp/vscode-integration';
import { injectable } from 'inversify';

/**
 * Tracks action kinds that are handled inside the extension host so the
 * contribution runtime can route and filter them without relying on legacy
 * compatibility wrappers.
 */
@injectable()
export class HandledActionRegistry {
    protected readonly registrations = new Map<string, number>();

    register(actionKind: string): Disposable {
        this.registrations.set(actionKind, (this.registrations.get(actionKind) ?? 0) + 1);

        return Disposable.create(() => {
            const nextCount = (this.registrations.get(actionKind) ?? 1) - 1;
            if (nextCount <= 0) {
                this.registrations.delete(actionKind);
            } else {
                this.registrations.set(actionKind, nextCount);
            }
        });
    }

    has(actionKind: string): boolean {
        return (this.registrations.get(actionKind) ?? 0) > 0;
    }
}
