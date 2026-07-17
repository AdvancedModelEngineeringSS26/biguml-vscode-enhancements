# VS Code Integration & GLSP Customization

This report summarises the completed contributions.

## Feature 1 — InversifyJS-based VS Code contribution runtime

### What we did

- Created the generic `big-vscode-contribution` package and registered its
  InversifyJS 6 module in bigUML's VS Code container.
- Split the former connector into focused services for client lifecycle,
  action routing and dispatching, document lifecycle, selection, diagnostics,
  progress, navigation, SVG export, and endpoint creation.
- Migrated consumers where possible. `BigGlspVSCodeConnector` remains as a
  deprecated compatibility facade during the transition.

### How we solved it

`VscodeActionHandler` is a multi-bound contribution point: `ActionRouter`
selects exactly one handler for an incoming GLSP action kind and rejects
duplicate registrations. Further extension points support message filtering,
client-registration hooks, and endpoint initialization. `WebviewEndpointFactory`
creates endpoints in child containers, allowing endpoint-scoped dependencies.

### Problems, missing parts, and future work

The upstream connector mixed transport, editor lifecycle, document state, and
VS Code UI concerns, making isolated changes difficult. Existing bigUML packages
also depended on its broad API, so migration must remain incremental. Future work
is to migrate the remaining consumers, remove the compatibility facade, add
service-level tests, and prepare the generic package for upstream contribution.

The new architecture has more DI bindings, but its explicit extension points are
preferable to adding new connector subclasses.

Further details: [architecture](client/packages/big-vscode-contribution/docs/architecture.md),
[migration guide](client/packages/big-vscode-contribution/docs/migration-guide.md), and
[manual verification](client/packages/big-vscode-contribution/docs/manual-verification.md).

## Feature 2 — Native extension-host action handling

### What we did and how

We added a native action runtime to `big-vscode-contribution`, so extension-host
services and sidebar webviews can communicate with the GLSP client and server
without routing through the old connector wrappers.

- `ActionDispatcher` dispatches actions to a specific or active client, its
  webview, the GLSP server, or extension-host handlers. Its `request()` API
  generates/correlates request IDs per client and resolves the matching response.
- `ActionListener` exposes filtered client, server, and extension-host action
  streams. `ActionRequestHandlerRegistry` handles extension-host requests and
  returns their responses.
- `ClientManager` is the single source of truth for registration, active-client
  lookup, and disposal. `ActionRouter` remains responsible for processing
  incoming action messages through Feature 1 handlers.
- The webview bridge, outline, revision management, and Advanced Search were
  migrated to validate dispatching and request/response communication.

### Runtime flow

```text
                         Outbound dispatch

 +-----------------+     +------------------+     +------------------+
 | Sidebar webview | --> | Extension-host  | --> | ActionDispatcher |
 +-----------------+     | webview bridge  |     +------------------+
                         +------------------+       |       |       |
                                                    v       v       v
                                                Diagram   GLSP   Extension-
                                                webview  server  host handler

                         Incoming processing

 +---------------------------+     +--------------+     +----------------+
 | Diagram webview or server | --> | ActionRouter | --> | Action handlers|
 +---------------------------+     +--------------+     +----------------+
                                          |
                                          v
                                  +----------------+
                                  | ActionListener |
                                  +----------------+
                                          |
                                          v
                                  Correlated response /
                                  interested consumer
```

### Problems, missing parts, and future work

Replacing the old connector at once would have risked regressions, so it remains
as a compatibility layer while consumers migrate. Pending requests are rejected
when a client is disposed, but explicit timeout/cancellation support and
automated multi-client tests are still missing. Future consumers should inject
the native services directly; the compatibility layer can then be removed.

The contribution and UML client packages compile successfully, but the runtime
behaviour described here is supported mainly by implementation inspection and
manual verification. Automated coverage is still needed for duplicate handler
registration, request correlation, client disposal, and concurrent clients.

This separation makes client ownership, dispatching, observation, and request
handling independently testable instead of coupling them to one connector.

## Feature 3 — VS Code native-integration fixes and audit

### What we did

We focused on custom-editor lifecycle behaviour and keybinding conflicts.

- GLSP now edits an isolated temporary restore model rather than the source
  `.uml` file directly. Save copies the current model to the source; backup,
  revert, discard, and cleanup operate on the temporary model. This prevents
  **Don't Save** from persisting unsaved edits.
- Diagram commands are scoped with `activeCustomEditorId` and a
  `glspDiagramFocused` context key. GLSP focus changes are forwarded to the
  extension host, which updates that key with `setContext`; undo/redo also avoid
  text-input focus.

### VS Code integration protocol

The specification names `docs/vscode-integration-protocol.md` as the core
deliverable. Because the group submission must be a single report, the protocol
is consolidated here instead of adding a separate repository document.

| VS Code integration point | GLSP usage and applicability | Recommendation |
| --- | --- | --- |
| `CustomEditorProvider` lifecycle and `workspace.fs` | Opening, resolving, dirty-state events, save, backup, revert, and disposal are used; this contribution improved backup, revert, and cleanup. | **Should fix:** complete reliable reload while retaining the isolated restore-model design. |
| `WebviewPanel` view-state/disposal events | Disposal participates in cleanup; view-state changes are not fully used. | **Nice to have:** use view state for active-diagram tracking and persistence. |
| `activeCustomEditorId`, custom context keys, and keybinding `when` clauses | Used with `glspDiagramFocused`; `!inputFocus` protects text input. There is no public `window.activeCustomEditor` API. | **Keep:** debug the remaining search/navigation command path separately. |
| Webview `setState/getState` and `WebviewPanelSerializer` | Not used; applicable to session and restart restoration. | **Should fix:** persist viewport state by document URI after GLSP initialization. |
| `retainContextWhenHidden` and `enableFindWidget` | The former may reduce reloads but does not replace lifecycle handling; the latter does not solve GLSP command conflicts. | **Nice to have / not a fix.** |
| Selection context | VS Code has no native diagram-selection API; GLSP exposes selection through extension-specific actions and context keys. | **Keep extension-specific:** fix the selected-element context-key issue. |
| Decorations, document links, and breadcrumbs | Text-editor decorations and document links do not directly apply to the canvas; breadcrumbs may be possible through symbols. | **Not applicable / nice to have:** investigate breadcrumbs only if needed. |
| Workspace trust | Not investigated in this contribution. | **Should audit** before treating workspace JavaScript plugins as production-ready. |

Unlike Theia's DI-managed diagram services and widgets, VS Code exposes a custom
editor as a webview and extension-owned document. bigUML must therefore bridge
focus, selection, lifecycle, and persistence state explicitly.

### Problems, missing parts, and future work

The custom-editor lifecycle is improved, but model reload after revert is still
unreliable despite reload-related server experiments. Viewport persistence was
not implemented. Some shortcuts (search and element navigation) still reach the
webview but do not complete their GLSP command/action path, so they need separate
command-handler debugging. Future work is to complete the remaining API audit,
fix reload, persist viewport state by document URI, and investigate native
selection integration.

The full lifecycle code is necessarily more complex because VS Code requires a
`CustomEditorProvider` to own save, backup, and revert semantics. Isolating the
working model is the key architectural boundary that makes those semantics safe.

## Feature 4 — Problem marker removal strategy

### What we did

VS Code erased all diagnostics when a diagram editor closed, discarding live markers the server will reissue on reopen. Theia keeps live markers and only removes batch markers (from explicit validation runs). This mismatch is tracked as [eclipse-glsp/glsp#990](https://github.com/eclipse-glsp/glsp/issues/990).

We contributed a fix to `eclipse-glsp/glsp-vscode-integration` (`GlspVscodeConnector.handleSetMarkersAction`) and applied the same logic to `DiagnosticsHandler` in `big-vscode-contribution`.

### How we solved it

`SetMarkersAction.reason` is `MarkersReason.BATCH` or `MarkersReason.LIVE` since protocol v2.5.0. A nested map `markersByReason: Map<uri, Map<reason, Diagnostic[]>>` tracks diagnostics by document and reason. On each incoming action the entry for that reason is updated and the full merge is written to the `DiagnosticCollection`. On editor close, only the `BATCH` entry is deleted; remaining `LIVE` markers stay visible.

Because Feature 1 replaced `GlspVscodeConnector` with DI-managed services, the upstream fix could not be consumed directly. `DiagnosticsHandler` is the equivalent handler in the new architecture, so the logic was applied there instead.

### Problems, missing parts, and future work

The collision with Feature 1 forced a duplication of the tracking logic rather than a shared dependency. Extracting a `MarkerDiagnosticsTracker` utility upstream that `DiagnosticsHandler` delegates to would resolve this. The upstream PR is still pending review. Marker positions are fixed at `Range(0,0,0,0)` as GLSP markers carry no line/column data.

## Feature 5 — Customization API: stylesheets and rendering plugins

### What we did and how

We added workspace-local customization through `.glsp/`, without rebuilding the
extension.

- Every `.glsp/styles/*.css` file is converted to a webview URI and injected
  after built-in styles. A file-system watcher reloads styles on create, change,
  or delete.
- Every `.glsp/rendering/*.js` file is loaded as a webview ES module. A curated
  `window.glspAPI` lets a plugin contribute a Sprotty `FeatureModule`; modules
  are intended to be collected before the diagram DI container is created, so
  view overrides can take effect before the first render.
- A colour-picker in the tool palette offers a simple alternative for per-element
  colours. It uses stable server-side CSS classes and persists choices in
  `localStorage`.

Dynamic `import()` was not viable in the webview sandbox. Static
`<script type="module">` resources worked when the workspace was included in
`localResourceRoots`, and cache-busting prevented stale plugin versions. Import
maps were not supported, so the prototype exposes the required GLSP/Sprotty APIs
through `window.glspAPI`; a typed SDK remains the preferred long-term contract.

The prototype relies on static plugin-module execution completing before the
asynchronous GLSP initialization handshake creates the diagram container. This
ordering worked in manual verification, but the implementation does not enforce
it with an explicit plugin-readiness barrier.

### Customization flow

```text
       +----------------------+          +-------------------------+
       | .glsp/styles/*.css   |          | .glsp/rendering/*.js    |
       +----------------------+          +-------------------------+
                  |                               |
                  v                               v
       +----------------------+          +-------------------------+
       | Scan and create      |          | Load ES modules and     |
       | webview style links  |          | expose window.glspAPI   |
       +----------------------+          +-------------------------+
                  |                               |
                  v                               v
       +----------------------+          +-------------------------+
       | Links after built-in |          | FeatureModule before    |
       | styles               |          | DI container creation   |
       +----------------------+          +-------------------------+
                  \                               /
                   \                             /
                    v                           v
                    +---------------------------+
                    |      Diagram webview      |
                    +---------------------------+
                               ^
                               |
                    +----------------------------+
                    | Picker -> localStorage     |
                    |        -> injected style   |
                    +----------------------------+
```

### Problems, missing parts, and future work

The main challenges were granting the webview access to workspace resources,
avoiding webview caching, and meeting the requirement that rendering overrides
are registered before container initialization. Workspace plugins run inside the
VS Code webview sandbox, but without validation or isolation from the diagram
application. Plugins are JavaScript-only, do not hot-reload, and receive only a
small untyped global API. Colour settings are machine-local rather than workspace
configuration.

Stylesheet discovery works for the usual single-editor case, but the provider
currently stores custom style links in one shared array. Multiple open diagrams,
especially from different workspace folders, can therefore overwrite one
another's stylesheet state. The links should be keyed by document or panel, as
the rendering-plugin list already is.

Future work is a typed, versioned plugin SDK; optional `.tsx` bundling and a
manifest; plugin validation/hot reload; an explicit plugin-readiness barrier;
per-editor stylesheet state; workspace-persisted colours; and automated coverage
for plugin ordering and concurrent-editor customization. The current `window`
handoff and string-based HTML injection work as a prototype but should be
replaced by a typed API and structured HTML/CSP construction.
