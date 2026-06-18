/**********************************************************************************
 * Copyright (c) 2025 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { TYPES as CONTRIBUTION_TYPES } from '@borkdominik-biguml/big-vscode-contribution';
import type {
    ActionDispatcher as ContributionActionDispatcher,
    ClientManager as ContributionClientManager
} from '@borkdominik-biguml/big-vscode-contribution/vscode';
import { type Action, type ActionMessage, type Disposable, RequestAction, type ResponseAction } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import { VscodeAction } from '../../../common/vscode.action.js';

/**
 * Compatibility wrapper over the contribution action dispatcher.
 *
 * @deprecated Inject contribution `ActionDispatcher` from
 * `@borkdominik-biguml/big-vscode-contribution/vscode` for new code.
 *
 * See `client/docs/feature1/compatibility-layer.md`.
 */
@injectable()
export class ActionDispatcher implements Disposable {
    @inject(CONTRIBUTION_TYPES.ActionDispatcher)
    protected readonly contributionActionDispatcher: ContributionActionDispatcher;
    @inject(CONTRIBUTION_TYPES.ClientManager)
    protected readonly clientManager: ContributionClientManager;

    /**
     * Dispatches a request action to the GLSP client (server) and returns a promise that resolves with the response action.
     *
     * @deprecated Use contribution `ActionDispatcher.request(action, clientId?)`.
     */
    request<Res extends ResponseAction>(action: RequestAction<Res>): Promise<ActionMessage<Res>> {
        if (!action.requestId || action.requestId === '') {
            action.requestId = RequestAction.generateRequestId();
        }
        action.requestId = VscodeAction.prefixRequestId(action.requestId);
        return this.contributionActionDispatcher.request(action);
    }

    /**
     * Dispatches an action to the GLSP client (server).
     * This method will not wait for a response.
     *
     * @deprecated Use contribution `ActionDispatcher.dispatch(action, clientId?)`.
     */
    dispatch(action: Action | Action[]): void {
        this.contributionActionDispatcher.dispatch(action);
    }

    /**
     * Dispatches an action to a specific GLSP client (server).
     * This method will not wait for a response.
     *
     * @deprecated Use contribution `ActionDispatcher.dispatch(action, clientId)`.
     */
    dispatchToClient(clientId: string | undefined, action: Action | Action[]): void {
        this.contributionActionDispatcher.dispatchToClient(action, clientId);
    }

    /**
     * Broadcasts an action to all GLSP clients (server).
     * This method will not wait for a response.
     *
     * @deprecated Use contribution `ClientManager.clients` and dispatch or send
     * messages explicitly for each target client.
     */
    broadcast(action: Action): void {
        this.clientManager.clients.forEach(client => {
            client.webviewEndpoint.sendMessage({
                clientId: client.clientId,
                action: action
            });
        });
    }

    dispose(): void {
        // Delegated state is owned by the contribution action dispatcher.
    }
}
