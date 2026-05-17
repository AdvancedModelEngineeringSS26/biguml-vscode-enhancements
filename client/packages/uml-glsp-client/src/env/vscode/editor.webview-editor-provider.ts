/*********************************************************************************
 * Copyright (c) 2023 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 *********************************************************************************/
import { ReactHtmlProvider, TYPES, WebviewEditorProvider } from '@borkdominik-biguml/big-vscode/vscode';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
    ActionMessageNotification,
    ClientStateChangeNotification,
    Deferred,
    DisposableCollection,
    DisposeClientSessionRequest,
    InitializeClientSessionRequest,
    InitializeNotification,
    InitializeServerRequest,
    ShutdownServerNotification,
    StartRequest,
    StopRequest,
    WebviewReadyNotification,
    type ActionMessage,
    type Disposable,
    type GLSPClient,
    type GLSPDiagramIdentifier,
    type GlspVscodeClient,
    type WebviewEndpoint,
    type WebviewEndpointOptions
} from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import {
    EventEmitter,
    type CancellationToken,
    type CustomDocument,
    type CustomDocumentBackup,
    type CustomDocumentBackupContext,
    type CustomDocumentEditEvent,
    type CustomDocumentOpenContext,
    type Event,
    Uri,
    type Webview,
    type WebviewPanel,
    type WebviewView,
    workspace
} from 'vscode';
import { Messenger } from 'vscode-messenger';
import type { MessageParticipant } from 'vscode-messenger-common';
import { GLSPIsReadyAction } from '../common/actions/editor.actions.js';
import type { ThemeIntegration } from './features/theme/theme-integration.js';

export const UmlDiagramEditorSettings = Symbol('UmlDiagramEditorSettings');
export interface UmlDiagramEditorSettings {
    viewType: string;
    diagramType: string;
}

interface UmlDiagramCustomDocument extends CustomDocument {
    backupUri?: Uri;
    restoredModelUri?: Uri;
    sourceUri?: Uri;
}

@injectable()
export class UmlDiagramEditorProvider extends WebviewEditorProvider {
    @inject(TYPES.Theme)
    protected readonly themeIntegration: ThemeIntegration;

    protected clients = new Map<string, GlspVscodeClient>();
    protected restoreSourceUriByRestoreUri = new Map<string, Uri>();
    protected viewCounter = 0;

    constructor(@inject(UmlDiagramEditorSettings) protected readonly settings: UmlDiagramEditorSettings) {
        super({
            viewId: settings.viewType,
            viewType: settings.viewType,
            htmlOptions: {
                files: {
                    js: [['glsp-client', 'bundle.js']],
                    css: [['glsp-client', 'bundle.css']]
                }
            }
        });
    }

    override get onDidChangeCustomDocument(): Event<CustomDocumentEditEvent<CustomDocument>> {
        return this.connector.onDidChangeCustomDocument as Event<CustomDocumentEditEvent<CustomDocument>>;
    }

    override openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, _token: CancellationToken): CustomDocument {
        const sourceUri = this.isRestoreUri(uri) ? (this.restoreSourceUriByRestoreUri.get(uri.toString()) ?? uri) : uri;
        const customDocument = {
            uri,
            backupUri: undefined,
            restoredModelUri: undefined,
            sourceUri,
            dispose: () => {
                const restoreUri = customDocument.restoredModelUri;
                if (restoreUri) {
                    void Promise.resolve(workspace.fs.delete(restoreUri)).catch(() => {
                        // Restore files are best-effort cleanup.
                    });
                    this.restoreSourceUriByRestoreUri.delete(restoreUri.toString());
                }
                this.restoreSourceUriByRestoreUri.delete(uri.toString());
            }
        } as UmlDiagramCustomDocument;

        if (openContext.backupId) {
            customDocument.backupUri = Uri.parse(openContext.backupId);
        }

        return customDocument;
    }

    override async resolveCustomEditor(document: CustomDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void> {
        let modelUri = document.uri;
        if (this.isUmlDiagramDocument(document)) {
            const sourceUri = document.sourceUri ?? document.uri;
            modelUri = await this.createRestoreModelUri(document.backupUri ?? sourceUri, sourceUri);
            document.restoredModelUri = modelUri;
            this.restoreSourceUriByRestoreUri.set(modelUri.toString(), sourceUri);
        }

        const client = await this.prepareGLSPClient(document, webviewPanel, modelUri);
        this.clients.set(document.uri.toString(), client);
        return super.resolveCustomEditor(document, webviewPanel, token);
    }

    protected override resolveMessenger(webview: WebviewView | WebviewPanel): void {
        this.toDispose.push(
            this.webviewMessenger,
            this.actionMessenger,
            this.resolveWebviewProtocol(this.webviewMessenger),
            this.resolveActionProtocol(this.actionMessenger),
            this.resolveWebviewEvents(webview)
        );
    }

    protected override resolveHtml(webview: Webview, context: CustomDocument): string {
        const clientId = this.clients.get(context.uri.toString())?.clientId ?? 'unknown';
        return new ReactHtmlProvider({
            rootProvider: () => `<div id="${clientId}_container" style="height: 100%;"></div>`,
            ...this.options.htmlOptions
        }).createHtml(this.extensionContext, webview);
    }

    override saveCustomDocument(document: CustomDocument, _cancellation: CancellationToken): Thenable<void> {
        if (this.isUmlDiagramDocument(document) && document.restoredModelUri) {
            return this.connector.saveDocument(document, document.sourceUri ?? document.uri);
        }
        return this.connector.saveDocument(document);
    }

    override saveCustomDocumentAs(document: CustomDocument, destination: Uri, _cancellation: CancellationToken): Thenable<void> {
        return this.connector.saveDocument(document, destination);
    }

    override async revertCustomDocument(document: CustomDocument, _cancellation: CancellationToken): Promise<void> {
        if (this.isUmlDiagramDocument(document) && document.restoredModelUri) {
            await this.restoreModelFromSource(document);
        }
        return this.connector.revertDocument(document, this.settings.diagramType);
    }

    override async backupCustomDocument(
        document: CustomDocument,
        context: CustomDocumentBackupContext,
        _cancellation: CancellationToken
    ): Promise<CustomDocumentBackup> {
        // Create a proper backup file containing the current model content so VS Code
        // can restore it later. Use restoredModelUri if present (session edits),
        // otherwise fall back to the source document.
        const umlDoc = document as UmlDiagramCustomDocument;
        const source = umlDoc.restoredModelUri ?? umlDoc.sourceUri ?? document.uri;
        try {
            const content = await workspace.fs.readFile(source);
            await workspace.fs.writeFile(context.destination, content);
            umlDoc.backupUri = context.destination;
        } catch (e) {
            // If reading/writing fails, still return a backup id so VS Code can track it.
        }

        return {
            id: context.destination.toString(),
            delete: async () => {
                try {
                    await workspace.fs.delete(context.destination);
                } catch {
                    // Ignore cleanup errors
                }
            }
        };
    }

    protected generateClientId(): string {
        return `${this.settings.diagramType}_${this.viewCounter++}`;
    }

    protected isUmlDiagramDocument(document: CustomDocument): document is UmlDiagramCustomDocument {
        return 'backupUri' in document && 'restoredModelUri' in document && 'sourceUri' in document;
    }

    protected isRestoreUri(uri: Uri): boolean {
        return path.basename(uri.fsPath).startsWith('.biguml-restore-');
    }

    protected async createRestoreModelUri(sourceUri: Uri, targetUri: Uri): Promise<Uri> {
        let sourceContent: Uint8Array;
        try {
            sourceContent = await workspace.fs.readFile(sourceUri);
        } catch {
            // VS Code may provide a stale backupId on reload. Fall back to the actual source document.
            sourceContent = await workspace.fs.readFile(targetUri);
        }
        // If we already created a restore file for this source, reuse it (overwrite).
        for (const [restoreUriString, storedSource] of this.restoreSourceUriByRestoreUri.entries()) {
            try {
                if (storedSource.toString() === sourceUri.toString()) {
                    const existingRestore = Uri.parse(restoreUriString);
                    await workspace.fs.writeFile(existingRestore, sourceContent);
                    return existingRestore;
                }
            } catch {
                // If overwrite/delete fails, ignore and continue to create a fresh file.
            }
        }
        const sourceExt = path.extname(targetUri.fsPath);
        const sourceDir = path.dirname(targetUri.fsPath);
        const restoreFileName = `.biguml-restore-${randomUUID()}${sourceExt}`;
        const restoreUri = Uri.file(path.join(sourceDir, restoreFileName));
        await workspace.fs.writeFile(restoreUri, sourceContent);
        return restoreUri;
    }

    protected async restoreModelFromSource(document: UmlDiagramCustomDocument): Promise<void> {
        const sourceUri = document.sourceUri ?? document.uri;
        const restoreUri = document.restoredModelUri;
        if (!restoreUri) {
            return;
        }
        const sourceContent = await workspace.fs.readFile(sourceUri);
        await workspace.fs.writeFile(restoreUri, sourceContent);
    }

    protected async prepareGLSPClient(document: CustomDocument, webviewPanel: WebviewPanel, modelUri: Uri): Promise<GlspVscodeClient> {
        const clientId = this.generateClientId();
        const diagramIdentifier: GLSPDiagramIdentifier = {
            diagramType: this.settings.diagramType,
            uri: EditorProvider.serializeUri(modelUri),
            clientId
        };

        const endpoint = new UmlWebviewEndpoint({
            diagramIdentifier,
            messenger: this.connector.messenger,
            webviewPanel
        });

        const client: GlspVscodeClient = {
            clientId: diagramIdentifier.clientId,
            diagramType: diagramIdentifier.diagramType,
            document,
            webviewEndpoint: endpoint as any as WebviewEndpoint
        };

        endpoint.onActionMessage(m => {
            if (GLSPIsReadyAction.is(m.action)) {
                this.themeIntegration.updateTheme(client);
            }
        });

        this.webviewMessenger.reuse(this.connector.messenger, endpoint.messageParticipant);
        await this.connector.registerClient(client);
        return client;
    }
}

export namespace EditorProvider {
    export function serializeUri(uri: Uri): string {
        let uriString = uri.toString();
        const match = uriString.match(/file:\/\/\/([a-z])%3A/i);
        if (match) {
            uriString = 'file:///' + match[1] + ':' + uriString.substring(match[0].length);
        }
        return uriString;
    }
}

type PublicOf<T> = {
    [K in keyof T]: T[K];
};

// Workaround as the WebviewEndpoint is not designed for webview reloads
class UmlWebviewEndpoint implements PublicOf<WebviewEndpoint>, Disposable {
    readonly webviewPanel: WebviewPanel;
    readonly messenger: Messenger;
    readonly messageParticipant: MessageParticipant;
    readonly diagramIdentifier: GLSPDiagramIdentifier;

    protected _readyDeferred = new Deferred<void>();
    protected toDispose = new DisposableCollection();

    protected onActionMessageEmitter = new EventEmitter<ActionMessage>();
    get onActionMessage(): Event<ActionMessage> {
        return this.onActionMessageEmitter.event;
    }

    protected _serverActions?: string[];
    get serverActions(): string[] | undefined {
        return this._serverActions;
    }

    protected _clientActions?: string[];
    get clientActions(): string[] | undefined {
        return this._clientActions;
    }

    constructor(options: WebviewEndpointOptions) {
        this.webviewPanel = options.webviewPanel;
        this.messenger = options.messenger ?? new Messenger();
        this.diagramIdentifier = options.diagramIdentifier;
        this.messageParticipant = this.messenger.registerWebviewPanel(this.webviewPanel);

        this.toDispose.push(
            this.webviewPanel.onDidDispose(() => {
                this.dispose();
            }),
            this.messenger.onNotification(
                WebviewReadyNotification,
                () => {
                    // When the webview is reloaded, it will send the WebviewReadyNotification again.
                    // In this case, we need to resend the diagram identifier to re-initialize the webview.
                    if (this._readyDeferred.state === 'resolved') {
                        this.sendDiagramIdentifier();
                    } else {
                        this._readyDeferred.resolve();
                    }
                },
                {
                    sender: this.messageParticipant
                }
            ),
            this.onActionMessageEmitter
        );
    }

    protected async sendDiagramIdentifier(): Promise<void> {
        await this.ready;
        if (this.diagramIdentifier) {
            this.messenger.sendNotification(InitializeNotification, this.messageParticipant, this.diagramIdentifier);
        }
    }

    /**
     * Hooks up a {@link GLSPClient} with the underlying webview and send the `initialize` message to the webview
     * (once its ready)
     * The GLSP client is called remotely from the webview context via the `vscode-messenger` RPC
     * protocol.
     * @param glspClient The client that should be connected
     * @returns A {@link Disposable} to dispose the remote connection and all attached listeners
     */
    initialize(glspClient: GLSPClient): Disposable {
        const toDispose = new DisposableCollection();
        toDispose.push(
            this.messenger.onNotification(
                ActionMessageNotification,
                msg => {
                    this.onActionMessageEmitter.fire(msg);
                },
                {
                    sender: this.messageParticipant
                }
            ),
            this.messenger.onRequest(StartRequest, () => glspClient.start(), { sender: this.messageParticipant }),
            this.messenger.onRequest(
                InitializeServerRequest,
                async params => {
                    const result = await glspClient.initializeServer(params);
                    if (!this._serverActions) {
                        this._serverActions = result.serverActions[this.diagramIdentifier.diagramType];
                    }
                    return result;
                },
                {
                    sender: this.messageParticipant
                }
            ),
            this.messenger.onRequest(
                InitializeClientSessionRequest,
                params => {
                    if (!this._clientActions) {
                        this._clientActions = params.clientActionKinds;
                    }
                    glspClient.initializeClientSession(params);
                },
                {
                    sender: this.messageParticipant
                }
            ),
            this.messenger.onRequest(DisposeClientSessionRequest, params => glspClient.disposeClientSession(params), {
                sender: this.messageParticipant
            }),
            this.messenger.onRequest(ShutdownServerNotification, () => glspClient.shutdownServer(), {
                sender: this.messageParticipant
            }),
            this.messenger.onRequest(StopRequest, () => glspClient.stop(), {
                sender: this.messageParticipant
            }),
            glspClient.onCurrentStateChanged(state =>
                this.messenger.sendNotification(ClientStateChangeNotification, this.messageParticipant, state)
            )
        );
        this.toDispose.push(toDispose);
        this.sendDiagramIdentifier();
        return toDispose;
    }

    sendMessage(actionMessage: ActionMessage): void {
        this.messenger.sendNotification(ActionMessageNotification, this.messageParticipant, actionMessage);
    }

    get ready(): Promise<void> {
        return this._readyDeferred.promise;
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
