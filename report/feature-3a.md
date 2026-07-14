# Maryam Jafarabadiashtiani - Feature 3 VS Code Integration Report

Feature 3 had several possible topics. My implemented work focused on:

- Custom editor lifecycle fixes for saving, backup, revert, and discard behavior.
- Reload behavior investigation and partial reload-related changes. Reload still does not work properly in the current state.
- Keybinding conflict handling for GLSP diagrams inside VS Code.

Viewport persistence was part of the Feature 3 topic list, but I did not implement viewport persistence.

## Commits

The following non-merge implementation commits are authored:

| Commit    | Date       | Message                                                           | Main area                                                 |
| --------- | ---------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `245998d` | 2026-04-13 | `feat: implement backupCustomDocument for GLSP custom editor`     | Custom editor backup and restore model URI support        |
| `141458c` | 2026-04-15 | `fix: Changes not being discarded when user selects "Don't Save"` | Isolated restore files and save destination fix           |
| `c8ab83b` | 2026-05-16 | `feat: implement revert method`                                   | Custom editor revert and backup content handling          |
| `19d050f` | 2026-05-17 | `fix: scope shortcuts to diagram focus`                           | Keybinding focus context                                  |
| `b47d2f3` | 2026-05-17 | `fix: revert fucntionality`                                       | Revert support and partial reload-related server handling |
| `aa083fe` | 2026-05-17 | `fix: cleanup restore files`                                      | Restore file cleanup                                      |
| `28cb204` | 2026-06-25 | `Potential fix for pull request finding`                          | `@injectable()` on reload-aware action handler            |

There were also merge or conflict-resolution changes authored by Maryam, especially `ebb3076` (`Merge main into feature-3-glsp-custom-editor-support`) and `85b21b3` (merge pull request). Some final lines in the current code are attributed to those merge commits because the Feature 3 branch was integrated with the newer contribution-runtime architecture.

## Files Changed By This Work

The main files affected by my Feature 3 work are:

- `client/packages/uml-glsp-client/src/env/vscode/editor.webview-editor-provider.ts`
- `client/packages/big-vscode/src/env/vscode/features/connector/glsp-vscode-connector.ts`
- `client/packages/big-vscode-contribution/src/env/vscode/document-manager.ts`
- `client/packages/uml-glsp-server/src/env/vscode/features/model/diagram-model-storage.ts`
- `client/packages/uml-glsp-server/src/env/vscode/features/model/reload-aware-computed-bounds-action-handler.ts`
- `client/packages/uml-glsp-server/src/env/vscode/features/module/module.ts`
- `client/application/vscode/package.json`
- `client/packages/big-vscode/src/env/vscode/features/command/default-commands.ts`
- `client/packages/uml-glsp-client/src/env/browser/webview/uml-starter.ts`

## Problem 1: Custom Editor Saving And "Don't Save"

### Original problem

The GLSP custom editor did not behave like a native VS Code editor. When a user changed a diagram and then closed it with "Don't Save", the changes could still be written back to the real `.uml` file. This happened because the editor and GLSP model were working directly on the source file, so backup, save, revert, reload, and close behavior were too tightly coupled.

The intended VS Code behavior is:

- A dirty custom editor must report edits through `onDidChangeCustomDocument`.
- `saveCustomDocument` should write changes only when VS Code asks for a save.
- `backupCustomDocument` should create a backup for hot exit or crash recovery without silently saving to the real file.
- `revertCustomDocument` should discard unsaved session changes.
- Closing with "Don't Save" should not save the real document.

### Custom document metadata

File: `client/packages/uml-glsp-client/src/env/vscode/editor.webview-editor-provider.ts`

I added the `UmlDiagramCustomDocument` interface:

```ts
interface UmlDiagramCustomDocument extends CustomDocument {
  backupUri?: Uri;
  restoredModelUri?: Uri;
  sourceUri?: Uri;
}
```

This extends VS Code's `CustomDocument` with the extra state needed by a GLSP diagram:

- `backupUri` stores a VS Code backup file URI when VS Code reopens the editor from a backup.
- `restoredModelUri` stores a temporary `.biguml-restore-*` file used for the active GLSP editing session.
- `sourceUri` stores the real source document URI, even when the GLSP server is editing the temporary restore file.

This was needed because GLSP needs a URI to load and save a model, while VS Code needs to distinguish between the real file and temporary backup or restore files.

### Opening a custom document

In `openCustomDocument`, I create a custom document object with the real URI, optional backup URI, optional restore URI, and a cleanup-aware `dispose` function.

Important behavior:

- If VS Code passes `openContext.backupId`, it is parsed into `backupUri`.
- If the URI is a `.biguml-restore-*` file, the provider tries to map it back to the real source URI.
- The document's `dispose` method calls `cleanupRestoreFile`.

Why this was added:

VS Code calls `openCustomDocument` before `resolveCustomEditor`. This is the earliest place where the provider can remember whether the editor is opening normally or from a backup. Without this state, the editor cannot correctly restore backup content during hot exit/open-from-backup flows, or know where to save later.

### Resolving the custom editor with a temporary model file

In `resolveCustomEditor`, I changed the GLSP model URI from always using `document.uri` to using a temporary restore model URI:

```ts
let modelUri = document.uri;
if (this.isUmlDiagramDocument(document)) {
  const sourceUri = document.sourceUri ?? document.uri;
  modelUri = await this.createRestoreModelUri(
    document.backupUri ?? sourceUri,
    sourceUri,
  );
  document.restoredModelUri = modelUri;
  this.restoreSourceUriByRestoreUri.set(modelUri.toString(), sourceUri);
}
const client = await this.prepareGLSPClient(document, webviewPanel, modelUri);
```

What this does:

- If there is a backup, the restore file is created from the backup.
- Otherwise, the restore file is created from the real source file.
- The GLSP client is prepared with the restore file URI instead of the real file URI.

Why this was added:

This isolates unsaved diagram edits from the real `.uml` file. The server can modify the temporary restore file during the editing session. If the user closes the editor with "Don't Save", those changes can be discarded by deleting the restore file instead of saving to the real document.

### Creating restore files

The helper `createRestoreModelUri(sourceUri, targetUri)` creates a temporary file named like:

```txt
.biguml-restore-<uuid>.uml
```

What it does:

- Reads the content from `sourceUri`.
- Falls back to `targetUri` if the source cannot be read. This handles stale VS Code backup IDs.
- Reuses an existing restore file for the same source when possible.
- Cleans stale restore files before creating a new one.
- Writes the content into the restore file.

Why this was added:

The restore file is the central protection against accidental saves. It gives GLSP a real file URI to work with, but the real user file stays unchanged until VS Code explicitly calls save.

### Saving

In `saveCustomDocument`, I changed the destination for UML documents that have a restore file:

```ts
if (this.isUmlDiagramDocument(document) && document.restoredModelUri) {
  return this.connector.saveDocument(
    document,
    document.sourceUri ?? document.uri,
  );
}
return this.connector.saveDocument(document);
```

What this does:

- If the editor is using a temporary restore file, saving writes the GLSP model back to the real source URI.
- If it is a normal document, it uses the default save path.

Why this was added:

The GLSP server is editing the restore file, but the user expects Save to update the real `.uml` file. This code connects those two worlds.

### Backup

In `backupCustomDocument`, I implemented real backup file writing:

```ts
const umlDoc = document as UmlDiagramCustomDocument;
const source = umlDoc.restoredModelUri ?? umlDoc.sourceUri ?? document.uri;
const content = await workspace.fs.readFile(source);
await workspace.fs.writeFile(context.destination, content);
umlDoc.backupUri = context.destination;
```

What this does:

- Reads the current editing-session content from the restore file if available.
- Writes that content to VS Code's requested backup destination.
- Stores the backup destination as `backupUri`.
- Returns a `CustomDocumentBackup` object with an `id` and a `delete` method.

Why this was added:

VS Code can call `backupCustomDocument` for hot exit or backup recovery. Returning only a backup ID was not enough because there would be no actual content to restore. Writing the backup file makes VS Code backup recovery possible without saving the real file.

### Revert and discard

In `revertCustomDocument`, I added restore-file reset behavior before asking the connector to reload:

```ts
if (this.isUmlDiagramDocument(document) && document.restoredModelUri) {
  await this.restoreModelFromSource(document);
}
return this.connector.revertDocument(document, this.settings.diagramType);
```

The helper `restoreModelFromSource` reads the real source file and overwrites the restore file with that content.

Why this was added:

When the user chooses "Don't Save" or reverts the editor, unsaved changes must be thrown away. Because GLSP is editing the restore file, revert means replacing the restore file content with the current on-disk content of the real file, then asking GLSP to refresh the model.

### Restore file cleanup

I added:

- `cleanupRestoreFile(document)`
- `cleanupStaleRestoreFiles(sourceDir, sourceExt)`
- Connector `onDidDispose` cleanup in `prepareGLSPClient`

What this does:

- Deletes the active restore file when the editor/client is disposed.
- Removes the restore URI from `restoreSourceUriByRestoreUri`.
- Deletes stale `.biguml-restore-*` files in the source directory, except active restore files.
- Treats cleanup as best effort, so failed cleanup does not break editor close.

Why this was added:

Temporary files are necessary for safe editing, but they should not accumulate in the workspace. Cleanup keeps the workaround practical and avoids confusing hidden files remaining after editor sessions.

### Preparing the GLSP client with the model URI

I changed `prepareGLSPClient` to accept `modelUri` and serialize that URI into the `GLSPDiagramIdentifier`:

```ts
const diagramIdentifier: GLSPDiagramIdentifier = {
  diagramType: this.settings.diagramType,
  uri: EditorProvider.serializeUri(modelUri),
  clientId,
};
```

Why this was added:

The GLSP server receives the diagram identifier and uses its URI to load the model. Passing `modelUri` lets the server work on the restore file while the VS Code custom document still represents the real source file.

## Problem 2: Revert Functionality And Reload Investigation

My main focus in this part was fixing revert functionality. I also worked on reload-related code paths because revert needs the diagram to be refreshed after the restore file is reset. However, reload is not fully fixed in the current repository state. The reload-related code below should be understood as an attempted or partial support mechanism, not as a complete working reload solution.

### Custom editor side

The custom editor calls:

```ts
this.connector.revertDocument(document, this.settings.diagramType);
```

The current compatibility connector delegates this to the contribution runtime:

```ts
revertDocument(document: TDocument, diagramType: string): Promise<void> {
    return this.contributionConnector.revertDocument(document, diagramType);
}
```

The legacy connector also passes the real source path when disposing a client session:

```ts
const sourcePath =
  ((client.document as any).sourceUri as vscode.Uri | undefined)?.path ??
  client.document.uri.path;
return { sourceUri: sourcePath };
```

Why this matters for revert:

The client session must be disposed using the real source URI, not the temporary restore URI. Otherwise the server can close or reload the wrong model.

### Contribution `DocumentManager`

File: `client/packages/big-vscode-contribution/src/env/vscode/document-manager.ts`

During the architecture merge, the revert logic moved into the contribution `DocumentManager`. The final code dispatches a `RequestModelAction` with:

```ts
options: {
    sourceUri: this.revertSourceUri(document),
    diagramType,
    forceReloadFromDisk: true
}
```

I added the `revertSourceUri` helper:

```ts
protected revertSourceUri(document: TDocument): string {
    const documentUris = document as TDocument & {
        restoredModelUri?: vscode.Uri;
        sourceUri?: vscode.Uri;
    };
    return documentUris.restoredModelUri?.toString() ?? documentUris.sourceUri?.toString() ?? document.uri.toString();
}
```

What this does:

- Uses the restore file URI first, because the GLSP server is editing that file.
- Falls back to the real source URI.
- Falls back to the document URI as a final default.
- Adds `forceReloadFromDisk: true` so the server can try to read model content from disk instead of relying only on stale in-memory state.

Why this was added:

Revert must discard unsaved changes and show the original model again. In this implementation, the current editor model is the restore file, so the revert path first resets that file and then asks the GLSP server to load it again. The `forceReloadFromDisk` option was added to support this flow, but the current reload behavior is still not fully reliable.

### Server model storage reload attempt

File: `client/packages/uml-glsp-server/src/env/vscode/features/model/diagram-model-storage.ts`

I added these imports and fields:

```ts
CommandStack;
readFile;
Disposable;
URI;
ForceReloadFromDisk;
```

and:

```ts
@inject(CommandStack) protected commandStack: CommandStack;
protected modelUpdateListener?: Disposable;
```

What this does:

- Gives the model storage access to the GLSP command stack.
- Tracks the active model update listener so it can be disposed before a new listener is installed.

Why this was added:

When a model is reloaded from disk, the old undo/redo command history no longer matches the model. The command stack must be flushed. Also, repeated reloads must not register multiple update listeners for the same client.

In `loadSourceModel`, I added:

```ts
if (this.shouldForceReloadFromDisk(action)) {
  await this.reloadFromDisk(sourceUri);
}
```

What this does:

- Checks whether the incoming `RequestModelAction` contains `forceReloadFromDisk`.
- If yes, reloads the file content from disk before requesting the semantic model.

The helper `reloadFromDisk` does:

```ts
this.commandStack.flush();
const content = await readFile(URI.parse(uri).fsPath, "utf-8");
await this.state.modelService.update<Diagram>(uri, content, "glsp");
```

Why this was added:

The old reload behavior could keep using stale in-memory content. This change tries to read the file from disk, update the model service, and clear commands that no longer apply.

Current limitation:

This does not mean reload is fully working. The current implementation still has reload problems, so this code should be described as part of the revert/reload investigation and not as a finished reload fix.

I also changed the model update listener handling:

```ts
this.modelUpdateListener?.dispose();
this.modelUpdateListener = this.state.modelService.onUpdate(...);
```

and in `sessionDisposed`:

```ts
this.modelUpdateListener?.dispose();
this.modelUpdateListener = undefined;
```

Why this was added:

Without disposing the old listener, every reload can add another listener. That can cause duplicated updates and stale model replacement behavior.

### Reload-aware computed bounds action handler attempt

File: `client/packages/uml-glsp-server/src/env/vscode/features/model/reload-aware-computed-bounds-action-handler.ts`

I added a new action handler:

```ts
export const ForceReloadFromDisk = "forceReloadFromDisk";

@injectable()
export class ReloadAwareComputedBoundsActionHandler extends ComputedBoundsActionHandler {
  override execute(action: ComputedBoundsAction): MaybePromise<Action[]> {
    const model = this.modelState.root;
    if (action.revision === model.revision) {
      this.modelState.clear(ForceReloadFromDisk);
      return super.execute(action);
    }

    if (this.modelState.get(ForceReloadFromDisk) === true) {
      this.modelState.clear(ForceReloadFromDisk);
      try {
        this.applyBounds(model, action);
      } catch {
        // A forced reload may receive bounds for the stale canvas first.
        // In that case, submit the reloaded model without those bounds.
      }
      return this.submissionHandler.submitModelDirectly();
    }

    return [];
  }
}
```

What this does:

- Defines the shared `forceReloadFromDisk` option key.
- Extends GLSP's `ComputedBoundsActionHandler`.
- If the bounds revision matches the current model revision, it behaves like the normal handler.
- If the revision does not match but a forced reload is active, it tries to apply bounds but tolerates stale bounds.
- Submits the reloaded model directly if stale bounds arrive during the reload.
- Returns no action for stale bounds when there is no forced reload.
- Uses `@injectable()` so Inversify can instantiate it correctly.

Why this was added:

GLSP receives computed bounds from the client after model rendering. During reload, the client can briefly send bounds for the old model revision. The default behavior may ignore or mishandle that flow. This handler was added to make forced reload more tolerant of stale bounds during revert/reload, but reload is still not completely reliable in the current state.

### Registering the reload-aware handler

File: `client/packages/uml-glsp-server/src/env/vscode/features/module/module.ts`

I imported:

```ts
ComputedBoundsActionHandler;
ReloadAwareComputedBoundsActionHandler;
```

and added:

```ts
binding.rebind(
  ComputedBoundsActionHandler,
  ReloadAwareComputedBoundsActionHandler,
);
```

What this does:

- Replaces the default computed bounds action handler with the reload-aware version.

Why this was added:

The new handler only works if the GLSP server dependency injection module binds it in place of the default handler. This registration is part of the attempted reload support around revert.

### Current status of revert and reload

The revert work is the main implemented functionality. The important idea is that unsaved changes are isolated in a temporary restore file, and revert overwrites that restore file with the original source content before asking GLSP to refresh the model.

Reload itself still does not work properly. The current code contains reload-related support such as `forceReloadFromDisk`, model-service updating, command-stack flushing, and stale computed-bounds handling.

## Problem 3: Keybinding Conflicts

### Original problem

VS Code keybindings are global unless they are restricted with `when` clauses. GLSP diagrams run inside a webview, so shortcuts such as `Ctrl+A`, `Ctrl+F`, `Alt+F`, `N`, `Alt+N`, undo, and redo can conflict with VS Code's built-in commands or with commands from other focused UI parts.

The goal was to make diagram shortcuts active only when:

- The active custom editor is the bigUML diagram editor.
- The GLSP diagram itself has focus.
- For undo/redo, no text input is focused.

### Adding `glspDiagramFocused` to keybinding `when` clauses

File: `client/application/vscode/package.json`

I changed diagram keybindings from only checking:

```json
"activeCustomEditorId == 'bigUML.diagramView'"
```

to checking:

```json
"activeCustomEditorId == 'bigUML.diagramView' && glspDiagramFocused"
```

This applies to:

- `bigUML.fit`
- `bigUML.center`
- `bigUML.selectAll`
- `bigUML.editor.activateResizeMode`
- `bigUML.editor.showSearch`
- `bigUML.editor.focusToolPalette`
- `bigUML.editor.focusDiagram`
- `bigUML.editor.enablePrimaryElementNavigator`
- `bigUML.editor.enableSecondaryElementNavigator`

For the element navigator shortcuts, the condition also keeps the selected-element requirement:

```json
"activeCustomEditorId == 'bigUML.diagramView' && glspDiagramFocused && bigUML.editorSelectedElementsAmount == 1"
```

In the later merge, undo and redo keybindings also include:

```json
"activeCustomEditorId == 'bigUML.diagramView' && glspDiagramFocused && !inputFocus"
```

What this does:

- `activeCustomEditorId` ensures the active editor is the diagram editor.
- `glspDiagramFocused` ensures the GLSP diagram webview has focus.
- `!inputFocus` prevents undo/redo from stealing focus from text input fields.

Why this was added:

This prevents bigUML diagram shortcuts from firing when the custom editor exists but focus is actually somewhere else.

### Setting the focus context in extension code

File: `client/packages/big-vscode/src/env/vscode/features/command/default-commands.ts`

I imported:

```ts
FocusStateChangedAction;
```

and added:

```ts
const diagramFocusedContextKey = "glspDiagramFocused";
void vscode.commands.executeCommand(
  "setContext",
  diagramFocusedContextKey,
  false,
);
```

Then I listened for focus-state actions from the GLSP client:

```ts
this.actionListener.registerListener((message) => {
  if (FocusStateChangedAction.is(message.action)) {
    void vscode.commands.executeCommand(
      "setContext",
      diagramFocusedContextKey,
      message.action.hasFocus,
    );
  }
});
```

What this does:

- Initializes the context key to `false`.
- Updates the context key whenever GLSP reports that the diagram focus changed.
- Makes the `package.json` keybinding `when` clauses dynamic.

Why this was added:

VS Code cannot automatically know whether a specific element inside a webview has focus. The webview must tell the extension host, and the extension host must expose that state as a VS Code context key.

### Forwarding GLSP focus changes from the webview

File: `client/packages/uml-glsp-client/src/env/browser/webview/uml-starter.ts`

I imported:

```ts
FocusStateChangedAction;
```

and registered it as an extension action kind:

```ts
container
  .bind(ExtensionActionKind)
  .toConstantValue(FocusStateChangedAction.KIND);
```

What this does:

- Allows `FocusStateChangedAction` to cross from the GLSP webview side to the VS Code extension host.

Why this was added:

The extension host cannot update `glspDiagramFocused` unless the webview-side action is allowed through the VS Code integration bridge.

### Manual keybinding observations

During testing, I observed that some diagram shortcuts work and some still do not behave correctly.

Working shortcuts:

| Shortcut | Command behavior    |
| -------- | ------------------- |
| `Alt+F`  | Fit diagram to view |
| `Alt+C`  | Center diagram      |
| `Ctrl+A` | Select all elements |
| `Alt+G`  | Focus diagram       |

Shortcuts that are not working properly:

| Shortcut | Expected behavior                  | Observation                                                                                         |
| -------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Ctrl+F` | Show search palette                | The keyboard event is fired in the webview developer tools, but the search palette does not appear. |
| `N`      | Enable primary element navigator   | The keyboard event is fired, but the navigator behavior does not happen correctly.                  |
| `Alt+N`  | Enable secondary element navigator | The keyboard event is fired, but the navigator behavior does not happen correctly.                  |

Based on this observation, the remaining issue does not look like a pure keybinding registration problem. The webview developer tools show that the keyboard event is fired. Therefore, the more likely problem is in the command handling or action handling after the keybinding event, especially for the search palette and element navigator commands.

## Research Topic 1: What VS Code Provides For Custom Editors

Official VS Code docs describe custom editors as fully customizable editors used instead of the normal text editor for specific resources. They are built from two pieces: a webview UI and a document model. VS Code provides two main custom editor styles:

- `CustomTextEditorProvider`: Uses VS Code's standard `TextDocument`. VS Code handles more of the file lifecycle automatically.
- `CustomEditorProvider`: Uses an extension-defined `CustomDocument`. This is more flexible, but the extension is responsible for save, backup, revert, and document lifecycle behavior.

Relevant VS Code APIs and integration points, with current implementation status:

| API or feature                                 | What VS Code provides                                                                        | Status in bigUML / Feature 3                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contributes.customEditors`                    | Declares a custom editor `viewType`, display name, selector, and priority in `package.json`. | Already implemented. bigUML registers `bigUML.diagramView` for `*.uml`.                                                                            |
| `window.registerCustomEditorProvider`          | Registers the provider implementation for the contributed `viewType`.                        | Already implemented by the VS Code extension setup. Required so VS Code can call the GLSP editor provider.                                         |
| `openCustomDocument`                           | Lets the extension create its custom document model for a URI.                               | Implemented/improved in this work. It now stores backup, restore, and source URIs.                                                                 |
| `resolveCustomEditor`                          | Gives the provider a `WebviewPanel` and asks it to fill in HTML and event listeners.         | Already implemented and extended. This work changed it so GLSP can use a temporary restore model URI.                                              |
| `saveCustomDocument`                           | Called by VS Code when the user saves the custom document.                                   | Implemented/improved. It saves restore-file contents back to the real source URI.                                                                  |
| `saveCustomDocumentAs`                         | Called for Save As.                                                                          | Already implemented. It delegates to connector save with a destination URI.                                                                        |
| `backupCustomDocument`                         | Called by VS Code for backups, for example hot exit.                                         | Implemented/improved. It writes real backup content from the restore file.                                                                         |
| `revertCustomDocument`                         | Called when VS Code needs to revert or discard changes.                                      | Main focus of this work. It resets the restore file from disk and triggers the GLSP revert/refresh path.                                           |
| `onDidChangeCustomDocument`                    | Event that tells VS Code a custom document changed.                                          | Already implemented through connector/document-manager integration. Used for dirty state and undo/redo integration.                                |
| `CustomDocument.dispose`                       | Cleanup hook for document resources.                                                         | Implemented/improved. It cleans temporary restore files and URI mappings.                                                                          |
| `WebviewPanel.onDidDispose`                    | Fires when the panel is closed or disposed.                                                  | Partly implemented through existing cleanup and connector disposal handling. Could be used more directly for future cleanup and state persistence. |
| `WebviewPanel.onDidChangeViewState`            | Fires when visibility or active state changes.                                               | Not fully used for Feature 3. Could be implemented later for active diagram tracking or better focus/view state behavior.                          |
| `WebviewPanel.reveal`                          | Shows the panel in an editor column.                                                         | Not a main part of this work. Could be used later for commands that need to bring a diagram editor forward.                                        |
| `WebviewPanelOptions.retainContextWhenHidden`  | Keeps the iframe alive while hidden, but with memory overhead.                               | Not implemented as a fix here. It could reduce reload cost, but it is not a replacement for correct save, backup, and revert handling.             |
| `WebviewPanelOptions.enableFindWidget`         | Enables VS Code's find widget in a webview panel.                                            | Not used as a keybinding fix. It does not solve command conflicts or GLSP search palette behavior.                                                 |
| Webview `acquireVsCodeApi().setState/getState` | Lets webview content persist JSON-serializable state within a session.                       | Missing/future work. Could help future viewport persistence, but viewport persistence was not implemented by me.                                   |
| `WebviewPanelSerializer`                       | Restores webview panels across VS Code restarts.                                             | Missing/future work. Could help restore webview state across VS Code restarts.                                                                     |
| `workspace.fs`                                 | File operations through VS Code's URI-aware file system API.                                 | Implemented in this work for backup, restore file creation, restore reset, and cleanup.                                                            |
| `commands.executeCommand('setContext', ...)`   | Sets context keys for menus and keybindings.                                                 | Implemented in the keybinding focus fix through `glspDiagramFocused`.                                                                              |
| `activeCustomEditorId` when-clause context     | Identifies the active custom editor ID.                                                      | Already used to scope bigUML keybindings to `bigUML.diagramView`.                                                                                  |
| `activeWebviewPanelId` when-clause context     | Identifies the active webview panel ID.                                                      | Not used here. For custom editors, `activeCustomEditorId` is the better fit.                                                                       |
| Custom context keys through `setContext`       | Lets extensions expose custom boolean/string/number context values.                          | Implemented for `glspDiagramFocused`. Existing selection context is present, but a bug was found for the `N` shortcut condition.                   |

Conclusion:

VS Code provides enough custom editor lifecycle hooks to implement a native-feeling GLSP editor, but `CustomEditorProvider` requires the extension to manage file lifecycle carefully. The most important missing piece in the original integration was not an API absence; it was that GLSP editing needed to be isolated from the real source file until VS Code explicitly requested save.

There is no stable public `window.activeCustomEditor` property used by this implementation. For keybindings, VS Code provides the `activeCustomEditorId` context key. For custom editor panels, the provider receives a `WebviewPanel` during `resolveCustomEditor`, and the extension can track panels/clients itself.

## Research Topic 2: Keybinding Integration

VS Code keybindings are contributed through `contributes.keybindings` in `package.json`. Each keybinding maps a key combination to a command and can include a `when` clause. The `when` clause is the key mechanism for preventing conflicts.

Useful VS Code keybinding tools:

| Mechanism                      | What it does                                       | How it applies here                                                                                   |
| ------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `contributes.keybindings`      | Declares extension keybindings.                    | bigUML declares diagram commands such as fit, center, select all, search, navigation, undo, and redo. |
| `when` clauses                 | Restrict when a keybinding is active.              | Used to require `activeCustomEditorId == 'bigUML.diagramView' && glspDiagramFocused`.                 |
| `activeCustomEditorId`         | Built-in context key for the active custom editor. | Prevents diagram commands from running in other editors.                                              |
| `activeWebviewPanelId`         | Built-in context key for active webview panels.    | Useful for generic webview panels; custom editors are better scoped with `activeCustomEditorId`.      |
| `inputFocus`                   | Built-in context for focused input widgets.        | Used with `!inputFocus` so undo/redo do not interrupt typing.                                         |
| `setContext` command           | Lets extensions define custom context keys.        | Used to set `glspDiagramFocused`.                                                                     |
| GLSP `FocusStateChangedAction` | GLSP client action that reports diagram focus.     | Used as the bridge from webview DOM focus to VS Code context state.                                   |

Why `activeCustomEditorId` alone was not enough:

The active editor can be the bigUML custom editor while focus is still inside another UI part, command palette, input field, side panel, or embedded webview widget. The extra `glspDiagramFocused` context key makes the condition more precise.

Why `glspDiagramFocused` is custom:

VS Code knows which custom editor is active, but it does not automatically expose focus information for the internal GLSP diagram DOM. That focus state exists inside the webview. Therefore, GLSP must send `FocusStateChangedAction` to the extension host, and the extension host must convert it into a VS Code context key.

Why `enableFindWidget` does not solve this:

`enableFindWidget` only enables the built-in find widget for a webview panel. It does not scope command execution, prevent global keybinding conflicts, or tell VS Code whether the diagram canvas has focus.

Recommended pattern:

1. Contribute commands in `package.json`.
2. Add strict `when` clauses using `activeCustomEditorId`, a custom diagram focus context, and `!inputFocus` where needed.
3. Register the commands in extension code.
4. Forward webview focus changes to the extension host.
5. Use `vscode.commands.executeCommand('setContext', key, value)` to update keybinding state.

## Notes On Viewport Persistence

Viewport persistence was listed in Feature 3, but I did not implement it.

A future implementation could use:

- GLSP viewport actions such as viewport change or set viewport actions.
- VS Code `workspaceState` or `globalState` to store viewport data by document URI.
- Webview `setState/getState` for session-only webview state.
- A server/client restore action after GLSP initialization.

## Bug Found During Code Exploration

### Keyboard shortcut `when` clause issue for `N`

While exploring and testing the keybinding code, I found a bug related to the `N` shortcut for the primary element navigator.

The keybinding is intended to run only when exactly one diagram element is selected:

```json
{
  "key": "n",
  "mac": "n",
  "command": "bigUML.editor.enablePrimaryElementNavigator",
  "when": "activeCustomEditorId == 'bigUML.diagramView' && glspDiagramFocused && bigUML.editorSelectedElementsAmount == 1"
}
```

Expected behavior:

- Pressing `N` should emit/run the command only when the active editor is `bigUML.diagramView`.
- The diagram must be focused.
- Exactly one element must be selected.

Actual observed behavior:

- When `N` is pressed, the command/event is emitted even though the command should be restricted by the `bigUML.editorSelectedElementsAmount == 1` condition.
- This suggests the context key value may not be updated correctly, may have the wrong value at the time the key is pressed, or the keybinding path may be bypassed by another handler.

Related keybinding observations:

- `Ctrl+F`, `N`, and `Alt+N` do not work properly from the user's perspective.
- In the webview developer tools, the keyboard events for these shortcuts can be seen.
- Because the events are fired but the expected UI behavior does not happen, the remaining issue is probably not only the keybinding declaration. It is likely related to the command/action handler chain after the keyboard event.

The working shortcuts from testing are `Alt+F`, `Alt+C`, `Ctrl+A`, and `Alt+G`.

## Official VS Code Sources Used

- VS Code Custom Editor API guide: https://code.visualstudio.com/api/extension-guides/custom-editors
- VS Code Webview API guide: https://code.visualstudio.com/api/extension-guides/webview
- VS Code When Clause Contexts reference: https://code.visualstudio.com/api/references/when-clause-contexts
- VS Code API reference, `registerCustomEditorProvider`, `CustomEditorProvider`, and `WebviewPanel`: https://code.visualstudio.com/api/references/vscode-api
- VS Code contribution point reference for `contributes.keybindings`: https://code.visualstudio.com/api/references/contribution-points#contributes.keybindings
