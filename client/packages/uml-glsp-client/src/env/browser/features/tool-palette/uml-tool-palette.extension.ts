/*********************************************************************************
 * Copyright (c) 2023 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 *********************************************************************************/
import {
    type Action,
    changeCodiconClass,
    createIcon,
    EnableToolPaletteAction,
    FocusDomAction,
    type GModelRoot,
    type ICommand,
    type KeyCode,
    MarqueeMouseTool,
    matchesKeystroke,
    MouseDeleteTool,
    type PaletteItem,
    RequestContextActions,
    RequestMarkersAction,
    SetContextActions,
    SetUIExtensionVisibilityAction,
    ToolPalette
} from '@eclipse-glsp/client';
import { KeyboardToolPalette } from '@eclipse-glsp/client/lib/features/accessibility/keyboard-tool-palette/keyboard-tool-palette.js';
import { injectable } from 'inversify';
import { SDShiftMouseTool } from '../../uml/diagram/sequence/features/tools/shift-mouse-tool.js';

const CLICKED_CSS_CLASS = 'clicked';
const CHEVRON_DOWN_ICON_ID = 'chevron-right';
const PALETTE_ICON_ID = 'symbol-color';
const COLOR_STORAGE_KEY = 'uml-palette-colors';
const COLOR_STYLE_ID = 'uml-palette-colors';

const COLORABLE_ELEMENT_TYPES: { label: string; cssClass: string }[] = [
    { label: 'Class', cssClass: 'uml-class-node' },
    { label: 'Abstract Class', cssClass: 'uml-abstract-class-node' },
    { label: 'Interface', cssClass: 'uml-interface-node' },
    { label: 'Enumeration', cssClass: 'uml-enumeration-node' },
    { label: 'Data Type', cssClass: 'uml-data-type-node' },
    { label: 'Primitive Type', cssClass: 'uml-primitive-type-node' },
    { label: 'Package', cssClass: 'uml-package-node' },
    { label: 'Instance Spec.', cssClass: 'uml-instance-specification-node' }
];

const AVAILABLE_KEYS: KeyCode[] = [
    'KeyA',
    'KeyB',
    'KeyC',
    'KeyD',
    'KeyE',
    'KeyF',
    'KeyG',
    'KeyH',
    'KeyI',
    'KeyJ',
    'KeyK',
    'KeyL',
    'KeyM',
    'KeyN',
    'KeyO',
    'KeyP',
    'KeyQ',
    'KeyR',
    'KeyS',
    'KeyT',
    'KeyU',
    'KeyV',
    'KeyX',
    'KeyY',
    'KeyZ'
];

const SEARCH_ICON_ID = 'search';
const SELECTION_TOOL_KEY: KeyCode[] = ['Digit1', 'Numpad1'];
const DELETION_TOOL_KEY: KeyCode[] = ['Digit2', 'Numpad2'];
const MARQUEE_TOOL_KEY: KeyCode[] = ['Digit3', 'Numpad3'];
const VALIDATION_TOOL_KEY: KeyCode[] = ['Digit4', 'Numpad4'];
const SEARCH_TOOL_KEY: KeyCode[] = ['Digit5', 'Numpad5'];

@injectable()
export class UmlToolPalette extends KeyboardToolPalette {
    declare defaultToolsButton: HTMLElement;
    protected colorPanel?: HTMLElement;

    protected override onBeforeShow(_containerElement: HTMLElement, root: Readonly<GModelRoot>): void {
        // Removed max height
        this.modelRootId = root.id;
    }

    override handle(action: Action): ICommand | Action | void {
        if (EnableToolPaletteAction.is(action)) {
            const requestAction = RequestContextActions.create({
                contextId: ToolPalette.ID,
                editorContext: {
                    selectedElementIds: []
                }
            });
            this.actionDispatcher.requestUntil(requestAction).then(response => {
                if (SetContextActions.is(response)) {
                    this.paletteItems = response.actions.map(e => e as PaletteItem);
                    this.actionDispatcher.dispatchAll([
                        SetUIExtensionVisibilityAction.create({ extensionId: ToolPalette.ID, visible: !this.editorContext.isReadonly })
                    ]);
                }
            });
        } else if (FocusDomAction.is(action) && action.id === ToolPalette.ID) {
            if (this.containerElement.contains(document.activeElement)) {
                this.toggleShortcutVisibility();
            } else {
                this.showShortcuts();
            }
            this.containerElement.focus();
        } else {
            super.handle(action);
        }
    }

    override changeActiveButton(button?: HTMLElement): void {
        if (this.lastActiveButton) {
            this.lastActiveButton.classList.remove(CLICKED_CSS_CLASS);
        }
        if (button) {
            button.classList.add(CLICKED_CSS_CLASS);
            this.lastActiveButton = button;
        } else {
            this.defaultToolsButton?.classList.add(CLICKED_CSS_CLASS);
            this.lastActiveButton = this.defaultToolsButton;
        }
    }

    protected override addMinimizePaletteButton(): void {
        // Removed max height
        const baseDiv = document.getElementById(this.options.baseDiv);
        const minPaletteDiv = document.createElement('div');
        minPaletteDiv.classList.add('minimize-palette-button');
        this.containerElement.classList.add('collapsible-palette');
        if (baseDiv) {
            const insertedDiv = baseDiv.insertBefore(minPaletteDiv, baseDiv.firstChild);
            const minimizeIcon = createIcon(CHEVRON_DOWN_ICON_ID);
            this.updateMinimizePaletteButtonTooltip(minPaletteDiv);
            minimizeIcon.onclick = _event => {
                if (this.isPaletteMaximized()) {
                    this.containerElement.style.maxHeight = '0px';
                } else {
                    this.containerElement.style.maxHeight = '';
                }
                this.updateMinimizePaletteButtonTooltip(minPaletteDiv);
                changeCodiconClass(minimizeIcon, PALETTE_ICON_ID);
                changeCodiconClass(minimizeIcon, CHEVRON_DOWN_ICON_ID);
            };
            insertedDiv.appendChild(minimizeIcon);
        }
    }

    protected override createHeaderTools(): HTMLElement {
        const headerTools = super.createHeaderTools();

        // TODO: Sequence Specific
        const createShiftButton = this.createShiftButton();
        headerTools.appendChild(createShiftButton);

        const colorButton = this.createColorPickerButton();
        headerTools.appendChild(colorButton);

        return headerTools;
    }

    protected createColorPickerButton(): HTMLElement {
        const button = createIcon(PALETTE_ICON_ID);
        button.title = 'Element colors (click to open color picker)';
        button.style.cssText = 'cursor:pointer; outline: 1px solid currentColor; border-radius:2px; padding:1px';

        const panel = this.getOrCreateColorPanel();

        button.onclick = event => {
            event.stopPropagation();
            if (panel.style.display === 'none') {
                const rect = button.getBoundingClientRect();
                // Show first so we can measure the panel width, then clamp to viewport
                panel.style.top = `${rect.bottom + 4}px`;
                panel.style.left = '0px';
                panel.style.display = 'block';
                const panelWidth = panel.offsetWidth;
                const left = Math.min(rect.left, window.innerWidth - panelWidth - 8);
                panel.style.left = `${Math.max(8, left)}px`;
            } else {
                panel.style.display = 'none';
            }
        };

        return button;
    }

    protected getOrCreateColorPanel(): HTMLElement {
        if (!this.colorPanel) {
            this.colorPanel = this.createColorPanel();
            document.body.appendChild(this.colorPanel);
            document.addEventListener('click', () => {
                this.colorPanel!.style.display = 'none';
            });
        }
        return this.colorPanel;
    }

    protected createColorPanel(): HTMLElement {
        const savedColors: Record<string, string> = this.loadSavedColors();

        const panel = document.createElement('div');
        panel.style.cssText = [
            'position: fixed',
            'z-index: 10000',
            'display: none',
            'background: var(--vscode-editor-background, #1e1e1e)',
            'border: 1px solid var(--vscode-panel-border, #444)',
            'border-radius: 4px',
            'padding: 8px',
            'min-width: 220px',
            'box-shadow: 0 4px 12px rgba(0,0,0,0.4)',
            'font-size: 12px',
            'color: var(--vscode-editor-foreground, #ccc)'
        ].join('; ');
        panel.onclick = e => e.stopPropagation();

        const title = document.createElement('div');
        title.textContent = 'Element Colors';
        title.style.cssText = 'font-weight: bold; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--vscode-panel-border, #444)';
        panel.appendChild(title);

        for (const { label, cssClass } of COLORABLE_ELEMENT_TYPES) {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin: 4px 0; gap: 8px';

            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            labelEl.style.flex = '1';

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = savedColors[cssClass] ?? '#eaf0f8';
            colorInput.style.cssText = 'width: 36px; height: 20px; border: none; cursor: pointer; padding: 0; background: none';
            colorInput.title = `Color for ${label}`;

            colorInput.addEventListener('input', () => {
                const colors = this.loadSavedColors();
                colors[cssClass] = colorInput.value;
                this.saveColors(colors);
                this.applyColors(colors);
            });

            const resetBtn = document.createElement('span');
            resetBtn.textContent = '↺';
            resetBtn.title = `Reset ${label} color`;
            resetBtn.style.cssText = 'cursor: pointer; opacity: 0.6; font-size: 14px; user-select: none';
            resetBtn.onclick = () => {
                const colors = this.loadSavedColors();
                delete colors[cssClass];
                colorInput.value = '#eaf0f8';
                this.saveColors(colors);
                this.applyColors(colors);
            };

            row.appendChild(labelEl);
            row.appendChild(colorInput);
            row.appendChild(resetBtn);
            panel.appendChild(row);
        }

        const resetAllRow = document.createElement('div');
        resetAllRow.style.cssText = 'margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--vscode-panel-border, #444); text-align: center';
        const resetAllBtn = document.createElement('button');
        resetAllBtn.textContent = 'Reset All Colors';
        resetAllBtn.style.cssText = [
            'background: var(--vscode-button-secondaryBackground, #3a3d41)',
            'color: var(--vscode-button-secondaryForeground, #ccc)',
            'border: none',
            'padding: 3px 10px',
            'border-radius: 3px',
            'cursor: pointer',
            'font-size: 11px'
        ].join('; ');
        resetAllBtn.onclick = () => {
            this.saveColors({});
            this.applyColors({});
            panel.querySelectorAll('input[type=color]').forEach(el => {
                (el as HTMLInputElement).value = '#eaf0f8';
            });
        };
        resetAllRow.appendChild(resetAllBtn);
        panel.appendChild(resetAllRow);

        return panel;
    }

    private loadSavedColors(): Record<string, string> {
        try {
            const saved = localStorage.getItem(COLOR_STORAGE_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    }

    private saveColors(colors: Record<string, string>): void {
        localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(colors));
    }

    private applyColors(colors: Record<string, string>): void {
        // Always remove and re-append so our style is the last in <head>,
        // guaranteeing it wins over any custom .glsp/styles/ stylesheets.
        const existing = document.getElementById(COLOR_STYLE_ID);
        if (existing) existing.remove();

        if (Object.keys(colors).length === 0) return;

        const style = document.createElement('style');
        style.id = COLOR_STYLE_ID;
        // !important so palette colors override custom CSS with equal specificity
        style.textContent = Object.entries(colors)
            .map(([cssClass, color]) => `.${cssClass} { fill: ${color} !important; }`)
            .join('\n');
        document.head.appendChild(style);
    }

    protected override createDefaultToolButton(): HTMLElement {
        const container = document.createElement('div');
        const icon = createIcon('inspect');
        icon.id = 'btn_default_tools';
        icon.title = 'Enable selection tool';

        container.onclick = this.onClickStaticToolButton(container);
        container.appendChild(this.createKeyboardShotcut(SELECTION_TOOL_KEY[0]));
        container.appendChild(icon);

        return container;
    }

    protected override createMouseDeleteToolButton(): HTMLElement {
        const container = document.createElement('div');
        const icon = createIcon('chrome-close');

        container.onclick = this.onClickStaticToolButton(container, MouseDeleteTool.ID);
        container.appendChild(this.createKeyboardShotcut(DELETION_TOOL_KEY[0]));
        container.appendChild(icon);

        return container;
    }

    protected override createMarqueeToolButton(): HTMLElement {
        const container = document.createElement('div');
        const icon = createIcon('screen-full');

        container.onclick = this.onClickStaticToolButton(container, MarqueeMouseTool.ID);
        container.appendChild(this.createKeyboardShotcut(MARQUEE_TOOL_KEY[0]));
        container.appendChild(icon);

        return container;
    }

    protected override createValidateButton(): HTMLElement {
        const container = document.createElement('div');
        const icon = createIcon('pass');
        icon.title = 'Validate model';

        container.onclick = _event => {
            const modelIds: string[] = [this.modelRootId];
            this.actionDispatcher.dispatch(RequestMarkersAction.create(modelIds));
        };
        container.appendChild(this.createKeyboardShotcut(VALIDATION_TOOL_KEY[0]));
        container.appendChild(icon);

        return container;
    }

    protected override createSearchButton(): HTMLElement {
        const container = document.createElement('div');
        const icon = createIcon(SEARCH_ICON_ID);
        icon.classList.add('search-icon');
        icon.title = 'Filter palette entries';
        container.onclick = _ev => {
            const searchField = document.getElementById(this.containerElement.id + '_search_field');
            if (searchField) {
                if (searchField.style.display === 'none') {
                    searchField.style.display = '';
                    searchField.focus();
                } else {
                    searchField.style.display = 'none';
                }
            }
        };
        container.appendChild(this.createKeyboardShotcut(SEARCH_TOOL_KEY[0]));
        container.appendChild(icon);

        return container;
    }

    protected createShiftButton(): HTMLElement {
        const verticalShiftToolButton = createIcon('split-vertical');
        verticalShiftToolButton.title = 'Enable vertical shift tool [Alt + Click]';
        verticalShiftToolButton.onclick = this.onClickStaticToolButton(verticalShiftToolButton, SDShiftMouseTool.ID);
        return verticalShiftToolButton;
    }

    protected override createKeyboardToolButton(item: PaletteItem, tabIndex: number, buttonIndex: number): HTMLElement {
        const button = document.createElement('div');
        // add keyboard index
        if (buttonIndex < AVAILABLE_KEYS.length) {
            button.appendChild(this.createKeyboardShotcut(AVAILABLE_KEYS[buttonIndex]));
        }
        button.tabIndex = tabIndex;
        button.classList.add('tool-button');
        if (item.icon) {
            button.appendChild(this.createIcon(item.icon));
        }
        button.insertAdjacentText('beforeend', item.label);
        button.onclick = this.onClickCreateToolButton(button, item);

        button.onkeydown = ev => {
            this.clickToolOnEnter(ev, button, item);
            this.clearToolOnEscape(ev);

            if (matchesKeystroke(ev, 'ArrowDown')) {
                if (buttonIndex + 1 > this.keyboardIndexButtonMapping.size - 1) {
                    this.selectItemViaArrowKey(this.keyboardIndexButtonMapping.get(0));
                } else {
                    this.selectItemViaArrowKey(this.keyboardIndexButtonMapping.get(buttonIndex + 1));
                }
            } else if (matchesKeystroke(ev, 'ArrowUp')) {
                if (buttonIndex - 1 < 0) {
                    this.selectItemViaArrowKey(this.keyboardIndexButtonMapping.get(this.keyboardIndexButtonMapping.size - 1));
                } else {
                    this.selectItemViaArrowKey(this.keyboardIndexButtonMapping.get(buttonIndex - 1));
                }
            }
        };

        return button;
    }

    protected createIcon(cssClass: string): HTMLDivElement {
        const icon = document.createElement('div');
        icon.classList.add(...['uml-icon', cssClass]);
        return icon;
    }

    override async preRequestModel(): Promise<void> {
        // in this phase, the notation is still not loaded
        return;
    }

    override async postRequestModel(): Promise<void> {
        const requestAction = RequestContextActions.create({
            contextId: ToolPalette.ID,
            editorContext: {
                selectedElementIds: []
            }
        });
        const response = await this.actionDispatcher.request<SetContextActions>(requestAction);
        this.paletteItems = response.actions.map(e => e as PaletteItem);
        if (!this.editorContext.isReadonly) {
            this.show(this.editorContext.modelRoot);
        }
        this.applyColors(this.loadSavedColors());
    }
}
