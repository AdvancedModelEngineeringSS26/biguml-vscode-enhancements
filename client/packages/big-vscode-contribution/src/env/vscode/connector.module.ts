/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import type { GlspVscodeServer } from '@eclipse-glsp/vscode-integration';
import { type Container, ContainerModule } from 'inversify';
import { TYPES } from '../common/types.js';
import { ActionDispatcher } from './action-dispatcher.js';
import { ActionListener, ActionRequestHandlerRegistry } from './action-listener.js';
import { ActionRouter } from './action-router.js';
import { ClientManager } from './client-manager.js';
import { ConnectorMessenger } from './connector-messenger.js';
import { DiagnosticsHandler } from './diagnostics-handler.js';
import { DirtyStateHandler } from './dirty-state-handler.js';
import { DocumentManager } from './document-manager.js';
import { ExportHandler } from './export-handler.js';
import { HandledActionMessageFilter } from './handled-action-message-filter.js';
import { HandledActionRegistry } from './handled-action-registry.js';
import { MessageHandler } from './message-handler.js';
import { NavigationHandler } from './navigation-handler.js';
import { ProgressHandler } from './progress-handler.js';
import { SelectionHandler } from './selection-handler.js';
import { SelectionTracker } from './selection-tracker.js';
import { VscodeContributionLifecycle } from './vscode-contribution-lifecycle.js';
import { VscodeConnector } from './vscode-connector.js';
import { DefaultWebviewEndpointFactory } from './webview-endpoint-factory.js';

export interface VscodeContributionModuleOptions {
    readonly server?: GlspVscodeServer;
}

export function createVscodeContributionModule(options: VscodeContributionModuleOptions = {}): ContainerModule {
    return new ContainerModule(bind => {
        if (options.server) {
            bind(TYPES.GlspVscodeServer).toConstantValue(options.server);
        }

        bind(TYPES.ClientManager).to(ClientManager).inSingletonScope();
        bind(TYPES.ConnectorMessenger).to(ConnectorMessenger).inSingletonScope();
        bind(TYPES.HandledActionRegistry).to(HandledActionRegistry).inSingletonScope();
        bind(TYPES.ActionListener).to(ActionListener).inSingletonScope();
        bind(TYPES.ActionRouter).to(ActionRouter).inSingletonScope();
        bind(TYPES.ActionDispatcher).to(ActionDispatcher).inSingletonScope();
        bind(ActionRequestHandlerRegistry).toSelf().inSingletonScope();
        bind(TYPES.SelectionTracker).to(SelectionTracker).inSingletonScope();
        bind(TYPES.DocumentManager).to(DocumentManager).inSingletonScope();
        bind(TYPES.WebviewEndpointFactory)
            .toDynamicValue(context => new DefaultWebviewEndpointFactory(context.container as Container))
            .inSingletonScope();
        bind(TYPES.VscodeContributionLifecycle).to(VscodeContributionLifecycle).inSingletonScope();
        bind(TYPES.VscodeConnector).to(VscodeConnector).inSingletonScope();

        bind(TYPES.MessageHandler).to(MessageHandler).inSingletonScope();
        bind(HandledActionMessageFilter).toSelf().inSingletonScope();
        bind(TYPES.DirtyStateHandler).to(DirtyStateHandler).inSingletonScope();
        bind(TYPES.DiagnosticsHandler).to(DiagnosticsHandler).inSingletonScope();
        bind(TYPES.ProgressHandler).to(ProgressHandler).inSingletonScope();
        bind(TYPES.NavigationHandler).to(NavigationHandler).inSingletonScope();
        bind(TYPES.ExportHandler).to(ExportHandler).inSingletonScope();
        bind(SelectionHandler).toSelf().inSingletonScope();

        bind(TYPES.MessagePropagationFilter).toService(HandledActionMessageFilter);
        bind(TYPES.VscodeActionHandler).toService(TYPES.MessageHandler);
        bind(TYPES.VscodeActionHandler).toService(SelectionHandler);
        bind(TYPES.VscodeActionHandler).toService(TYPES.DirtyStateHandler);
        bind(TYPES.VscodeActionHandler).toService(TYPES.DiagnosticsHandler);
        bind(TYPES.VscodeActionHandler).toService(TYPES.ProgressHandler);
        bind(TYPES.VscodeActionHandler).toService(TYPES.NavigationHandler);
        bind(TYPES.VscodeActionHandler).toService(TYPES.ExportHandler);
    });
}
