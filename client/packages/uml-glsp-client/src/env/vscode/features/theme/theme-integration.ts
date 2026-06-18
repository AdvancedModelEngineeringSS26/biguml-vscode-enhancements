/*********************************************************************************
 * Copyright (c) 2023 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 *********************************************************************************/
import { TYPES as CONTRIBUTION_TYPES } from '@borkdominik-biguml/big-vscode-contribution';
import type { ActionDispatcher as ContributionActionDispatcher } from '@borkdominik-biguml/big-vscode-contribution/vscode';
import type { ClientManager } from '@borkdominik-biguml/big-vscode-contribution/vscode';
import { SetUmlThemeAction, type UmlTheme } from '@borkdominik-biguml/uml-glsp-client';
import { type GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { inject, injectable, postConstruct } from 'inversify';
import * as vscode from 'vscode';

@injectable()
export class ThemeIntegration {
    protected readonly disposables: vscode.Disposable[] = [];

    constructor(
        @inject(CONTRIBUTION_TYPES.ActionDispatcher)
        protected readonly actionDispatcher: ContributionActionDispatcher,
        @inject(CONTRIBUTION_TYPES.ClientManager)
        protected readonly clientManager: ClientManager
    ) {}

    @postConstruct()
    initialize(): void {
        this.refresh();
        this.onChange(_e => this.refresh());
    }

    updateTheme(client: GlspVscodeClient): void {
        this.actionDispatcher.dispatch(this.createAction(), client.clientId);
    }

    refresh(): void {
        const action = this.createAction();
        this.clientManager.clients.forEach(client => {
            this.actionDispatcher.dispatch(action, client.clientId);
        });
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }

    protected onChange(cb: (e: vscode.ColorTheme) => void): void {
        this.disposables.push(vscode.window.onDidChangeActiveColorTheme(cb));
    }

    protected createAction(): SetUmlThemeAction {
        return SetUmlThemeAction.create(mapTheme(vscode.window.activeColorTheme));
    }
}

function mapTheme(theme: vscode.ColorTheme): UmlTheme {
    switch (theme.kind) {
        case vscode.ColorThemeKind.Dark:
        case vscode.ColorThemeKind.HighContrast:
            return 'dark';
        default:
            return 'light';
    }
}
