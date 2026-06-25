/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import {
    type Action,
    type ComputedBoundsAction,
    ComputedBoundsActionHandler,
    type MaybePromise
} from '@eclipse-glsp/server';
import { injectable } from 'inversify';

export const ForceReloadFromDisk = 'forceReloadFromDisk';

@injectable()
export class ReloadAwareComputedBoundsActionHandler extends ComputedBoundsActionHandler {
    override execute(action: ComputedBoundsAction): MaybePromise<Action[]> {
        const model = this.modelState.root;
        if (action.revision === model.revision) {
            this.modelState.clear(ForceReloadFromDisk);
            return super.execute(action);
        }

        if (this.modelState.get(ForceReloadFromDisk) === true) {
            this.modelState.clear(ForceReloadFromDisk);
            try {
                this.applyBounds(model, action);
            } catch {
                // A forced reload may receive bounds for the stale canvas first.
                // In that case, submit the reloaded model without those bounds.
            }
            return this.submissionHandler.submitModelDirectly();
        }

        return [];
    }
}
