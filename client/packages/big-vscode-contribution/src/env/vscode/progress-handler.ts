/**********************************************************************************
 * Copyright (c) 2026 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/

import { EndProgressAction, StartProgressAction, UpdateProgressAction } from '@eclipse-glsp/protocol';
import { Deferred, type ActionMessage, type GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import * as vscode from 'vscode';
import type { VscodeActionHandler } from '../common/action-handler.js';
import type { MessageOrigin, MessageProcessingResult } from '../common/message-routing.js';
import { TYPES } from '../common/types.js';
import type { ClientManager } from './client-manager.js';

interface ProgressReporter {
    readonly deferred: Deferred<void>;
    readonly progress?: vscode.Progress<{
        message?: string;
        increment?: number;
    }>;
    currentPercentage?: number;
}

@injectable()
export class ProgressHandler<TDocument extends vscode.CustomDocument = vscode.CustomDocument>
    implements VscodeActionHandler<TDocument>, vscode.Disposable
{
    readonly actionKinds = [StartProgressAction.KIND, UpdateProgressAction.KIND, EndProgressAction.KIND] as const;
    protected readonly reportersByClientId = new Map<string, Map<string, ProgressReporter>>();
    protected readonly disposeListener: vscode.Disposable;

    constructor(@inject(TYPES.ClientManager) protected readonly clientManager: ClientManager<TDocument>) {
        this.disposeListener = this.clientManager.onDidDispose(client => {
            const reporters = this.reportersByClientId.get(client.clientId);
            reporters?.forEach(reporter => reporter.deferred.resolve());
            this.reportersByClientId.delete(client.clientId);
        });
    }

    handle(
        message: ActionMessage,
        client: GlspVscodeClient<TDocument> | undefined,
        _origin: MessageOrigin
    ): MessageProcessingResult {
        if (!client) {
            return {
                processedMessage: undefined,
                messageChanged: true
            };
        }

        if (StartProgressAction.is(message.action)) {
            this.handleStartProgress(message as ActionMessage<StartProgressAction>, client);
        } else if (UpdateProgressAction.is(message.action)) {
            this.handleUpdateProgress(message as ActionMessage<UpdateProgressAction>, client);
        } else if (EndProgressAction.is(message.action)) {
            this.handleEndProgress(message as ActionMessage<EndProgressAction>, client);
        } else {
            return {
                processedMessage: message,
                messageChanged: false
            };
        }

        return {
            processedMessage: undefined,
            messageChanged: true
        };
    }

    protected handleStartProgress(message: ActionMessage<StartProgressAction>, client: GlspVscodeClient<TDocument>): void {
        const { progressId, title, message: progressMessage, percentage } = message.action;
        const deferred = new Deferred<void>();
        const initialPercentage = (percentage ?? -1) >= 0 ? percentage : undefined;
        const reporterId = this.progressReporterId(client, progressId);
        const progressReporters = this.getProgressReporters(client.clientId);

        void vscode.window.withProgress({ title, location: vscode.ProgressLocation.Notification }, progress => {
            progressReporters.set(reporterId, {
                deferred,
                progress,
                currentPercentage: initialPercentage
            });
            progress.report({ message: progressMessage, increment: percentage });
            return deferred.promise.finally(() => {
                progressReporters.delete(reporterId);
            });
        });
    }

    protected handleUpdateProgress(message: ActionMessage<UpdateProgressAction>, client: GlspVscodeClient<TDocument>): void {
        const reporter = this.getProgressReporters(client.clientId).get(this.progressReporterId(client, message.action.progressId));
        if (!reporter?.progress) {
            return;
        }

        const newPercentage = (message.action.percentage ?? -1) >= 0 ? message.action.percentage : undefined;
        const currentPercentage = reporter.currentPercentage ?? 0;
        const increment = newPercentage !== undefined ? newPercentage - currentPercentage : undefined;

        reporter.progress.report({
            message: message.action.message,
            increment
        });

        if (newPercentage !== undefined) {
            reporter.currentPercentage = newPercentage;
        }
    }

    protected handleEndProgress(message: ActionMessage<EndProgressAction>, client: GlspVscodeClient<TDocument>): void {
        const reporterId = this.progressReporterId(client, message.action.progressId);
        const progressReporters = this.getProgressReporters(client.clientId);
        const reporter = progressReporters.get(reporterId);
        if (!reporter) {
            return;
        }

        reporter.deferred.resolve();
        progressReporters.delete(reporterId);
    }

    protected getProgressReporters(clientId: string): Map<string, ProgressReporter> {
        let progressReporters = this.reportersByClientId.get(clientId);
        if (!progressReporters) {
            progressReporters = new Map<string, ProgressReporter>();
            this.reportersByClientId.set(clientId, progressReporters);
        }
        return progressReporters;
    }

    protected progressReporterId(client: GlspVscodeClient<TDocument>, progressId: string): string {
        return `${client.clientId}_${progressId}`;
    }

    dispose(): void {
        this.disposeListener.dispose();
        this.reportersByClientId.forEach(progressReporters => {
            progressReporters.forEach(reporter => reporter.deferred.resolve());
            progressReporters.clear();
        });
        this.reportersByClientId.clear();
    }
}
