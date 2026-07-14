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
                    +------------------+
                    | Sidebar Webview  |
                    +------------------+
                             |
                             v
                    +------------------+
                    | ActionDispatcher |
                    +------------------+
                             |
                             v
                    +------------------+
                    |  ActionRouter    |
                    +------------------+
                      /              \
                     v                v
        +------------------+   +------------------+
        | Extension Host   |   |   GLSP Server    |
        +------------------+   +------------------+
                      \            /
                       \          /
                        v        v
                 +----------------------+
                 | Correlated Response  |
                 +----------------------+
```

### Problems, missing parts, and future work

Replacing the old connector at once would have risked regressions, so it remains
as a compatibility layer while consumers migrate. Pending requests are rejected
when a client is disposed, but explicit timeout/cancellation support and
automated multi-client tests are still missing. Future consumers should inject
the native services directly; the compatibility layer can then be removed.

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

### VS Code API audit and outcome

`CustomEditorProvider` lifecycle hooks (`open`, `resolve`, save, backup, revert,
and dispose), `workspace.fs`, custom context keys, and keybinding `when` clauses
are applicable and used. `activeCustomEditorId` is the appropriate built-in
editor context; there is no public `window.activeCustomEditor` API.

VS Code does not provide a native diagram-selection API; GLSP selection must be
exposed through extension-specific actions/context. Text-editor decorations and
document links are not directly applicable to a canvas custom editor. Breadcrumbs,
workspace-trust handling, and a detailed Theia comparison were not investigated
in this contribution and remain documentation work.

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

<!-- TODO: Summarise the implemented marker-removal behaviour, its distinction
between live and batch validation markers, verification, remaining limitations,
and any upstream contribution work. -->

## Feature 5 — Customization API: stylesheets and rendering plugins

### What we did and how

We added workspace-local customization through `.glsp/`, without rebuilding the
extension.

- Every `.glsp/styles/*.css` file is converted to a webview URI and injected
  after built-in styles. A file-system watcher reloads styles on create, change,
  or delete.
- Every `.glsp/rendering/*.js` file is loaded as a webview ES module. A curated
  `window.glspAPI` lets a plugin contribute a Sprotty `FeatureModule`; modules
  are collected before the diagram DI container is created, so view overrides
  take effect before the first render.
- A colour-picker in the tool palette offers a simple alternative for per-element
  colours. It uses stable server-side CSS classes and persists choices in
  `localStorage`.

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
are registered before container initialization. Workspace JavaScript is executed
without validation or sandboxing; this is an important limitation. Plugins are
JavaScript-only, do not hot-reload, and receive only a small untyped global API.
Colour settings are machine-local rather than workspace configuration.

Future work is a typed, versioned plugin SDK; optional `.tsx` bundling and a
manifest; plugin validation/hot reload; and workspace-persisted colours. The
current `window` handoff and string-based HTML injection work as a prototype but
should be replaced by a typed API and structured HTML/CSP construction.
