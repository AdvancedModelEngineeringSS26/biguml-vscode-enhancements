/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { inject, injectable } from 'inversify';
import type * as vscode from 'vscode';
import { TYPES } from '../common/types.js';
import type { ActionDispatcher } from './action-dispatcher.js';
import type { ActionListener } from './action-listener.js';
import type { ClientManager } from './client-manager.js';
import type { DiagnosticsHandler } from './diagnostics-handler.js';
import type { DocumentManager } from './document-manager.js';
import type { ProgressHandler } from './progress-handler.js';
import type { SelectionTracker } from './selection-tracker.js';

@injectable()
export class VscodeContributionLifecycle implements vscode.Disposable {
    protected disposed = false;

    constructor(
        @inject(TYPES.ProgressHandler) protected readonly progressHandler: ProgressHandler,
        @inject(TYPES.DiagnosticsHandler) protected readonly diagnosticsHandler: DiagnosticsHandler,
        @inject(TYPES.DocumentManager) protected readonly documentManager: DocumentManager,
        @inject(TYPES.SelectionTracker) protected readonly selectionTracker: SelectionTracker,
        @inject(TYPES.ActionDispatcher) protected readonly actionDispatcher: ActionDispatcher,
        @inject(TYPES.ActionListener) protected readonly actionListener: ActionListener,
        @inject(TYPES.ClientManager) protected readonly clientManager: ClientManager
    ) {}

    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.progressHandler.dispose();
        this.diagnosticsHandler.dispose();
        this.documentManager.dispose();
        this.selectionTracker.dispose();
        this.actionDispatcher.dispose();
        this.actionListener.dispose();
        this.clientManager.dispose();
    }
}
