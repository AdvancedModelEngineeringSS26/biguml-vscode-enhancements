/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { DisposableCollection } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import * as vscode from 'vscode';
import type { SelectionState } from '../common/message-routing.js';
import { TYPES } from '../common/types.js';
import type { ClientManager } from './client-manager.js';

export interface SelectionChangeEvent {
    readonly clientId: string;
    readonly selection: SelectionState;
}

@injectable()
export class SelectionTracker<TDocument extends vscode.CustomDocument = vscode.CustomDocument> implements vscode.Disposable {
    protected readonly selections = new Map<string, SelectionState>();
    protected readonly toDispose = new DisposableCollection();

    protected readonly onDidSelectionChangeEmitter = new vscode.EventEmitter<SelectionChangeEvent>();
    readonly onDidSelectionChange = this.onDidSelectionChangeEmitter.event;

    constructor(@inject(TYPES.ClientManager) protected readonly clientManager: ClientManager<TDocument>) {
        this.toDispose.push(
            this.clientManager.onDidDispose(client => {
                this.clearSelection(client.clientId);
            })
        );
    }

    /**
     * Contribution-native owner of per-client selection state. This replaces
     * the legacy connector selection map for new runtime code.
     */
    get selection(): SelectionState | undefined {
        const clientId = this.clientManager.activeClient?.clientId;
        return clientId ? this.selections.get(clientId) : undefined;
    }

    getSelection(clientId: string): SelectionState | undefined {
        return this.selections.get(clientId);
    }

    setSelection(clientId: string, selection: SelectionState): void {
        this.selections.set(clientId, selection);
        this.onDidSelectionChangeEmitter.fire({ clientId, selection });
    }

    clearSelection(clientId: string): void {
        this.selections.delete(clientId);
    }

    dispose(): void {
        this.toDispose.dispose();
        this.selections.clear();
        this.onDidSelectionChangeEmitter.dispose();
    }
}
