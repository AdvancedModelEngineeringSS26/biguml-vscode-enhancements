/**********************************************************************************
 * Copyright (c) 2025 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { TYPES as CONTRIBUTION_TYPES } from '@borkdominik-biguml/big-vscode-contribution';
import type { ActionListener as ContributionActionListener } from '@borkdominik-biguml/big-vscode-contribution/vscode';
import {
    ActionRequestHandlerRegistry as ContributionActionRequestHandlerRegistry,
    type CacheActionListener as ContributionCacheActionListener
} from '@borkdominik-biguml/big-vscode-contribution/vscode';
import type { InferResponseType } from '@borkdominik-biguml/uml-glsp-server';
import {
    type ActionMessage,
    type Disposable,
    type MaybePromise,
    type RequestAction,
    type ResponseAction
} from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';

/**
 * Compatibility adapter over the contribution-native action listener services.
 *
 * @deprecated Inject contribution `ActionListener` and
 * `ActionRequestHandlerRegistry` from
 * `@borkdominik-biguml/big-vscode-contribution/vscode` for new code.
 *
 * See `client/docs/feature1/compatibility-layer.md`.
 */
@injectable()
export class ActionListener implements Disposable {
    @inject(CONTRIBUTION_TYPES.ActionListener)
    protected readonly contributionActionListener: ContributionActionListener;
    @inject(ContributionActionRequestHandlerRegistry)
    protected readonly requestHandlerRegistry: ContributionActionRequestHandlerRegistry;

    dispose(): void {
        // Delegated state is owned by contribution services.
    }

    /**
     * @deprecated Use contribution `ActionListener.registerListener(...)`.
     */
    registerListener(callback: (action: ActionMessage) => void): Disposable {
        return this.contributionActionListener.registerListener(callback);
    }

    /**
     * @deprecated Use contribution `ActionListener.registerServerListener(...)`.
     */
    registerServerListener(callback: (action: ActionMessage) => void): Disposable {
        return this.contributionActionListener.registerServerListener(callback);
    }

    /**
     * @deprecated Use contribution `ActionListener.registerVSCodeListener(...)`.
     */
    registerVSCodeListener(callback: (action: ActionMessage) => void): Disposable {
        return this.contributionActionListener.registerVSCodeListener(callback);
    }

    /**
     * @deprecated Use contribution
     * `ActionRequestHandlerRegistry.handleGLSPRequest(...)`.
     */
    handleGLSPRequest<TRequest extends RequestAction<ResponseAction>>(
        kind: TRequest['kind'],
        handler: (action: ActionMessage<TRequest>) => MaybePromise<InferResponseType<TRequest>>
    ): Disposable {
        return this.requestHandlerRegistry.handleGLSPRequest(
            kind,
            handler as (action: ActionMessage<TRequest>) => MaybePromise<ResponseAction>
        );
    }

    /**
     * @deprecated Use contribution
     * `ActionRequestHandlerRegistry.handleVSCodeRequest(...)`.
     */
    handleVSCodeRequest<TRequest extends RequestAction<ResponseAction>>(
        kind: TRequest['kind'],
        handler: (action: ActionMessage<TRequest>) => MaybePromise<InferResponseType<TRequest>>
    ): Disposable {
        return this.requestHandlerRegistry.handleVSCodeRequest(
            kind,
            handler as (action: ActionMessage<TRequest>) => MaybePromise<ResponseAction>
        );
    }

    /**
     * @deprecated Use contribution `ActionListener.createCache(...)`.
     */
    createCache(cachedActionKinds: string[]): CacheActionListener {
        return new CacheActionListener(this.contributionActionListener.createCache(cachedActionKinds));
    }
}

/**
 * @deprecated Use contribution `CacheActionListener` returned by
 * `ActionListener.createCache(...)`.
 */
export class CacheActionListener implements Disposable {
    constructor(protected readonly delegate: ContributionCacheActionListener) {}

    /**
     * @deprecated Use contribution `CacheActionListener.onDidChange`.
     */
    get onDidChange() {
        return this.delegate.onDidChange;
    }

    /**
     * @deprecated Use contribution `CacheActionListener.getAction(kind)`.
     */
    getAction(kind: string): ActionMessage | undefined {
        return this.delegate.getAction(kind);
    }

    /**
     * @deprecated Use contribution `CacheActionListener.getActions()`.
     */
    getActions(): ActionMessage[] {
        return this.delegate.getActions();
    }

    dispose(): void {
        this.delegate.dispose();
    }
}
