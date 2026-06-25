/*********************************************************************************
 * Copyright (c) 2023 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 *********************************************************************************/
import { TYPES as CONTRIBUTION_TYPES } from '@borkdominik-biguml/big-vscode-contribution';
import type {
    ConnectorMessenger as ContributionConnectorMessenger,
    DefaultWebviewEndpointFactory as ContributionWebviewEndpointFactory,
    VscodeConnector
} from '@borkdominik-biguml/big-vscode-contribution/vscode';
import { ReactHtmlProvider, WebviewEditorProvider } from '@borkdominik-biguml/big-vscode/vscode';
import { DisposableCollection, type GLSPDiagramIdentifier, type GlspVscodeClient } from '@eclipse-glsp/vscode-integration';
import { inject, injectable } from 'inversify';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
    FileType,
    RelativePattern,
    Uri,
    workspace,
    type CancellationToken,
    type CustomDocument,
    type CustomDocumentBackup,
    type CustomDocumentBackupContext,
    type CustomDocumentEditEvent,
    type CustomDocumentOpenContext,
    type Event,
    type Webview,
    type WebviewPanel,
    type WebviewView
} from 'vscode';

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
    @inject(CONTRIBUTION_TYPES.WebviewEndpointFactory)
    protected readonly webviewEndpointFactory: ContributionWebviewEndpointFactory;
    @inject(CONTRIBUTION_TYPES.ConnectorMessenger)
    protected readonly connectorMessenger: ContributionConnectorMessenger;
    @inject(CONTRIBUTION_TYPES.VscodeConnector)
    protected readonly connector: VscodeConnector;

    protected clients = new Map<string, GlspVscodeClient>();
    protected restoreSourceUriByRestoreUri = new Map<string, Uri>();
    protected renderingPlugins = new Map<string, string[]>();
    protected viewCounter = 0;
    protected customStyleLinks: string[] = [];

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
                void this.cleanupRestoreFile(customDocument);
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
        this.customStyleLinks = await this.collectCustomStyleLinks(document, webviewPanel.webview);
        this.setupStylesheetWatcher(document, webviewPanel);
        const pluginUris = await this.getRenderingPluginUris(document, webviewPanel.webview);
        this.renderingPlugins.set(document.uri.toString(), pluginUris);
        return super.resolveCustomEditor(document, webviewPanel, token);
    }

    protected setupStylesheetWatcher(document: CustomDocument, webviewPanel: WebviewPanel): void {
        const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return;
        }

        const watcher = workspace.createFileSystemWatcher(new RelativePattern(workspaceFolder, '.glsp/styles/*.css'));

        const refresh = async (): Promise<void> => {
            this.customStyleLinks = await this.collectCustomStyleLinks(document, webviewPanel.webview);
            webviewPanel.webview.html = this.resolveHtml(webviewPanel.webview, document, Date.now());
        };

        const disposables = new DisposableCollection(
            watcher,
            watcher.onDidCreate(refresh),
            watcher.onDidChange(refresh),
            watcher.onDidDelete(refresh),
            webviewPanel.onDidDispose(() => disposables.dispose())
        );
    }

    protected override getLocalResourceRoots(document: CustomDocument): Uri[] {
        const roots = super.getLocalResourceRoots(document);
        const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
            roots.push(workspaceFolder.uri);
        }
        return roots;
    }

    protected async collectCustomStyleLinks(document: CustomDocument, webview: Webview): Promise<string[]> {
        const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return [];
        }
        const stylesDir = Uri.joinPath(workspaceFolder.uri, '.glsp', 'styles');
        try {
            const entries = await workspace.fs.readDirectory(stylesDir);
            return entries
                .filter(([name, type]) => name.endsWith('.css') && type === FileType.File)
                .map(([name]) => webview.asWebviewUri(Uri.joinPath(stylesDir, name)).toString());
        } catch {
            return [];
        }
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

    protected override resolveHtml(webview: Webview, context: CustomDocument, cacheBust?: number): string {
        const clientId = this.clients.get(context.uri.toString())?.clientId ?? 'unknown';
        let html = new ReactHtmlProvider({
            rootProvider: () => `<div id="${clientId}_container" style="height: 100%;"></div>`,
            ...this.options.htmlOptions,
            customStyleLinks: this.customStyleLinks
        }).createHtml(this.extensionContext, webview);

        if (cacheBust !== undefined) {
            html = html.replace('</head>', `<!-- v=${cacheBust} -->\n</head>`);
        }

        const pluginBootstrap = `<script>window.__glspPlugins = window.__glspPlugins ?? [];</script>`;
        const pluginScripts = (this.renderingPlugins.get(context.uri.toString()) ?? [])
            .map(uri => `<script type="module" src="${uri}"></script>`)
            .join('\n');

        return html.replace('<body>', `<body>\n${pluginBootstrap}`).replace('</body>', `${pluginScripts}\n</body>`);
    }

    protected async getRenderingPluginUris(document: CustomDocument, webview: Webview): Promise<string[]> {
        const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) return [];

        const renderingDir = Uri.joinPath(workspaceFolder.uri, '.glsp', 'rendering');
        try {
            const entries = await workspace.fs.readDirectory(renderingDir);
            return entries
                .filter(([name, fileType]) => name.endsWith('.js') && fileType === FileType.File)
                .map(([name]) => `${webview.asWebviewUri(Uri.joinPath(renderingDir, name)).toString()}?v=${Date.now()}`);
        } catch {
            return [];
        }
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
        } catch {
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
        await this.cleanupStaleRestoreFiles(sourceDir, sourceExt);
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

    protected async cleanupRestoreFile(document: UmlDiagramCustomDocument): Promise<void> {
        const restoreUri = document.restoredModelUri;
        if (restoreUri) {
            document.restoredModelUri = undefined;
            this.restoreSourceUriByRestoreUri.delete(restoreUri.toString());
            try {
                await workspace.fs.delete(restoreUri);
            } catch {
                // Restore files are best-effort cleanup.
            }
        }
        this.restoreSourceUriByRestoreUri.delete(document.uri.toString());
    }

    protected async cleanupStaleRestoreFiles(sourceDir: string, sourceExt: string): Promise<void> {
        const activeRestoreUris = new Set(this.restoreSourceUriByRestoreUri.keys());
        let entries: [string, FileType][];
        try {
            entries = await workspace.fs.readDirectory(Uri.file(sourceDir));
        } catch {
            return;
        }

        await Promise.all(
            entries
                .filter(([name, fileType]) => fileType === FileType.File && name.startsWith('.biguml-restore-') && path.extname(name) === sourceExt)
                .map(async ([name]) => {
                    const restoreUri = Uri.file(path.join(sourceDir, name));
                    if (activeRestoreUris.has(restoreUri.toString())) {
                        return;
                    }
                    try {
                        await workspace.fs.delete(restoreUri);
                    } catch {
                        // Stale restore files are best-effort cleanup.
                    }
                })
        );
    }

    protected async prepareGLSPClient(document: CustomDocument, webviewPanel: WebviewPanel, modelUri: Uri): Promise<GlspVscodeClient> {
        const clientId = this.generateClientId();
        const diagramIdentifier: GLSPDiagramIdentifier = {
            diagramType: this.settings.diagramType,
            uri: EditorProvider.serializeUri(modelUri),
            clientId
        };

        const endpoint = this.webviewEndpointFactory.create({
            diagramIdentifier,
            messenger: this.connectorMessenger.messenger,
            webviewPanel
        });

        const client: GlspVscodeClient = {
            clientId: diagramIdentifier.clientId,
            diagramType: diagramIdentifier.diagramType,
            document,
            webviewEndpoint: endpoint
        };
        const disposeRestoreFile = this.connector.onDidDispose(disposedClient => {
            if (disposedClient === client && this.isUmlDiagramDocument(document)) {
                disposeRestoreFile.dispose();
                void this.cleanupRestoreFile(document);
            }
        });

        this.webviewMessenger.reuse(endpoint.messenger, endpoint.messageParticipant);
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
