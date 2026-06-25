/*********************************************************************************
 * Copyright (c) 2023 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 *********************************************************************************/
import { TYPES as CONTRIBUTION_TYPES } from '@borkdominik-biguml/big-vscode-contribution';
import type { ActionDispatcher, ActionListener } from '@borkdominik-biguml/big-vscode-contribution/vscode';
import { TYPES, type GlspDiagramSettings, type SelectionService } from '@borkdominik-biguml/big-vscode/vscode';
import { EnableToolsAction, FocusDomAction } from '@borkdominik-biguml/uml-glsp-server';
import { FocusStateChangedAction } from '@eclipse-glsp/client/lib/base/focus/focus-state-change-action.js';
import { CenterAction, FitToScreenAction, RequestExportSvgAction, SelectAllAction } from '@eclipse-glsp/protocol';
import { inject, injectable, postConstruct } from 'inversify';
import { SetUIExtensionVisibilityAction } from 'sprotty/lib/base/ui-extensions/ui-extension-registry.js';
import * as vscode from 'vscode';

@injectable()
export class DefaultCommandsProvider {
    constructor(
        @inject(TYPES.ExtensionContext) protected readonly extensionContext: vscode.ExtensionContext,
        @inject(TYPES.GlspDiagramSettings) protected readonly diagramSettings: GlspDiagramSettings,
        @inject(CONTRIBUTION_TYPES.ActionDispatcher) protected readonly actionDispatcher: ActionDispatcher,
        @inject(CONTRIBUTION_TYPES.ActionListener) protected readonly actionListener: ActionListener,
        @inject(TYPES.SelectionService) protected readonly selectionService: SelectionService
    ) {}

    @postConstruct()
    protected init(): void {
        let selectedElements: string[] = [];
        const diagramFocusedContextKey = 'glspDiagramFocused';

        void vscode.commands.executeCommand('setContext', diagramFocusedContextKey, false);

        const selectionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.extensionContext.subscriptions.push(selectionStatusBarItem);

        this.extensionContext.subscriptions.push(
            this.actionListener.registerListener(message => {
                if (FocusStateChangedAction.is(message.action)) {
                    void vscode.commands.executeCommand('setContext', diagramFocusedContextKey, message.action.hasFocus);
                }
            })
        );

        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(`${this.diagramSettings.name}.fit`, () => {
                this.actionDispatcher.dispatch(FitToScreenAction.create(selectedElements));
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.center`, () => {
                this.actionDispatcher.dispatch(CenterAction.create(selectedElements));
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.selectAll`, () => {
                this.actionDispatcher.dispatch(SelectAllAction.create());
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.show.umlPanel`, () => {
                vscode.commands.executeCommand('bigUml.panel.property-palette.focus');
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.exportAsSVG`, () => {
                this.actionDispatcher.dispatch(RequestExportSvgAction.create());
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.editor.activateResizeMode`, () => {
                this.actionDispatcher.dispatch(EnableToolsAction.create(['glsp.resize-tool']));
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.editor.showSearch`, () => {
                this.actionDispatcher.dispatch(
                    SetUIExtensionVisibilityAction.create({
                        extensionId: 'search-autocomplete-palette',
                        visible: true
                    })
                );
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.editor.focusToolPalette`, () => {
                this.actionDispatcher.dispatch(FocusDomAction.create('tool-palette'));
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.editor.focusDiagram`, () => {
                this.actionDispatcher.dispatch(FocusDomAction.create('graph'));
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.editor.enablePrimaryElementNavigator`, () => {
                this.actionDispatcher.dispatch(EnableToolsAction.create(['uml.primary-element-navigator-tool']));
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.editor.enableSecondaryElementNavigator`, () => {
                this.actionDispatcher.dispatch(EnableToolsAction.create(['uml.secondary-element-navigator-tool']));
            }),
            vscode.commands.registerCommand(`${this.diagramSettings.name}.getSelection`, () => this.selectionService.selection)
            /*
        vscode.commands.registerCommand(`${this.diagramSettings.name}.layout`, () => {
            this.connector.sendActionToActiveClient(LayoutOperation.create([]));
        })
        */
        );

        const showSelectionDetailCommand = `${this.diagramSettings.name}.showSelectionDetail`;
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(showSelectionDetailCommand, () => {
                const detail =
                    selectedElements.length > 0
                        ? `Selected elements (${selectedElements.length}):\n${selectedElements.join('\n')}`
                        : 'No elements selected in diagram';
                vscode.window.showInformationMessage(detail);
            })
        );

        selectionStatusBarItem.command = showSelectionDetailCommand;

        this.extensionContext.subscriptions.push(
            this.selectionService.onDidSelectionChange(({ state }) => {
                selectedElements = [...state.selectedElementsIDs];
                const count = selectedElements.length;

                vscode.commands.executeCommand('setContext', `${this.diagramSettings.name}.editorSelectedElementsAmount`, count);
                vscode.commands.executeCommand('setContext', `${this.diagramSettings.name}.editorSelectedElementsIds`, selectedElements);

                selectionStatusBarItem.text =
                    count > 0 ? `$(pass) ${count} element${count === 1 ? '' : 's'} selected` : `$(circle-slash) No selection`;
                selectionStatusBarItem.tooltip =
                    count > 0 ? `Selected: ${selectedElements.join(', ')}` : 'No elements selected in diagram';
                selectionStatusBarItem.show();
            })
        );
    }
}
