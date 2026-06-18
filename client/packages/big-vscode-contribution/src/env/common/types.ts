/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

export const TYPES = {
    GlspVscodeServer: Symbol('GlspVscodeServer'),
    VscodeConnector: Symbol('VscodeConnector'),
    VscodeContributionLifecycle: Symbol('VscodeContributionLifecycle'),
    ConnectorMessenger: Symbol('ConnectorMessenger'),
    ClientManager: Symbol('ClientManager'),
    ClientRegistrationContribution: Symbol('ClientRegistrationContribution'),
    ActionRouter: Symbol('ActionRouter'),
    ActionDispatcher: Symbol('ActionDispatcher'),
    ActionListener: Symbol('ActionListener'),
    HandledActionRegistry: Symbol('HandledActionRegistry'),
    MessageHandler: Symbol('MessageHandler'),
    SelectionTracker: Symbol('SelectionTracker'),
    DirtyStateHandler: Symbol('DirtyStateHandler'),
    DiagnosticsHandler: Symbol('DiagnosticsHandler'),
    ProgressHandler: Symbol('ProgressHandler'),
    NavigationHandler: Symbol('NavigationHandler'),
    ExportHandler: Symbol('ExportHandler'),
    DocumentManager: Symbol('DocumentManager'),
    WebviewEndpointFactory: Symbol('WebviewEndpointFactory'),
    WebviewEndpointContribution: Symbol('WebviewEndpointContribution'),
    MessagePropagationFilter: Symbol('MessagePropagationFilter'),
    VscodeActionHandler: Symbol('VscodeActionHandler')
} as const;
