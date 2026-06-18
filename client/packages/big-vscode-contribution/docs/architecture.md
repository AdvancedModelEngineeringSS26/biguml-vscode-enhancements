# VS Code Contribution Architecture

`big-vscode-contribution` provides the contribution-native VS Code GLSP runtime.
It decomposes the responsibilities that previously lived in the upstream
`GlspVscodeConnector` into focused Inversify-managed services.

The package is generic. It must not depend on bigUML-specific packages. Product
or diagram-specific behavior should attach through contribution points.

## Composition Root

The VS Code runtime module is created with:

```ts
createVscodeContributionModule({ server });
```

The implementation lives in:

```text
src/env/vscode/connector.module.ts
```

The module binds the core runtime services, built-in action handlers, and
extension points. Shared service identifiers are exported as `TYPES`.

## Service Catalog

| Service | Responsibility |
| --- | --- |
| `VscodeConnector` | Coordinates client registration, message routing, message filtering, save, revert, and disposal. |
| `ClientManager` | Owns registered clients, active-client lookup, document-to-client lookup, and panel lifecycle cleanup. |
| `ActionRouter` | Observes inbound action messages and delegates action-specific processing to `VscodeActionHandler`s. |
| `ActionDispatcher` | Dispatches actions and requests to a client, server, or extension-host handled action stream. |
| `ActionListener` | Exposes observed client, server, and extension-host action streams. |
| `ActionRequestHandlerRegistry` | Registers extension-host request handlers and dispatches responses. |
| `HandledActionRegistry` | Tracks action kinds handled in the extension host. |
| `HandledActionMessageFilter` | Prevents extension-host-handled client actions from being forwarded to the server again. |
| `SelectionTracker` | Owns selection state per client. |
| `DocumentManager` | Coordinates custom document change events, save, and revert. |
| `DirtyStateHandler` | Converts dirty-state actions into document edit/change and save-completion events. |
| `DiagnosticsHandler` | Applies GLSP marker updates to VS Code diagnostics. |
| `ProgressHandler` | Maps GLSP progress actions to VS Code progress UI. |
| `NavigationHandler` | Opens external targets through VS Code commands. |
| `ExportHandler` | Handles SVG export actions. |
| `ConnectorMessenger` | Owns the shared extension-host messenger instance. |
| `WebviewEndpointFactory` | Creates endpoint-scoped injectable webview endpoints. |

## Runtime Flows

### Client Registration

1. A consumer creates an endpoint through `WebviewEndpointFactory`.
2. The consumer creates a `GlspVscodeClient`.
3. The consumer calls `VscodeConnector.registerClient(client, options)`.
4. `ClientManager` records the client and document mapping.
5. `ClientRegistrationContribution.onBeforeClientInitialize` hooks run.
6. The endpoint initializes against the GLSP client.
7. The GLSP client session disposal is registered.
8. `ClientRegistrationContribution.onClientRegistered` hooks run.

Use `ClientRegistrationContribution` for client-level setup that should happen
when a client is registered.

### Incoming Messages

1. `VscodeConnector` receives a message from the client or server.
2. `ActionRouter.processMessage(...)` observes valid action messages through
   `ActionListener`.
3. `ActionRouter` resolves a single matching `VscodeActionHandler` by
   `action.kind`.
4. The handler returns the processed message result.
5. `VscodeConnector` applies all `MessagePropagationFilter`s in order.
6. The filtered message is forwarded to the server or client unless a filter
   returns `undefined`.

Add new action-specific behavior through `VscodeActionHandler`. Add forwarding
or suppression rules through `MessagePropagationFilter`.

### Outgoing Actions

`ActionDispatcher.dispatch(action, clientId?)` resolves the target client from
the explicit `clientId` or the active client.

It then routes the action based on endpoint capabilities:

- client actions are sent to the webview endpoint
- server actions are sent to the GLSP server
- actions that are not sent to the client or server, but are registered as
  extension-host handled, are emitted through `ActionListener.onVscodeAction`

Use explicit client IDs when possible. Active-client dispatch is useful for UI
commands, but service code should avoid depending on editor focus when it
already knows the target client.

### Request Handling

Use `ActionRequestHandlerRegistry` for request/response actions handled by the
extension host.

Registering a handler also registers the action kind in `HandledActionRegistry`.
When a matching request is observed, the handler returns a response action and
`ActionDispatcher` sends it back to the originating client.

### Document Lifecycle

`DocumentManager` owns the custom document events consumed by VS Code custom
editor providers.

Save dispatches `SaveModelAction` for the document's client. Dirty-state
handling resolves the save when the model reports that the document is clean.

Revert dispatches `RequestModelAction` for the document's client and diagram
type.

### Endpoint Creation

`WebviewEndpointFactory.create(options)` creates an endpoint-scoped child
container, binds the endpoint options, resolves `InjectableWebviewEndpoint`, and
runs all `WebviewEndpointContribution`s.

Use `WebviewEndpointContribution` for endpoint-local setup. Do not construct
webview endpoints directly in new code.

## Extension Points

| Extension point | Use when |
| --- | --- |
| `TYPES.VscodeActionHandler` | You need to process one or more inbound action kinds. |
| `TYPES.MessagePropagationFilter` | You need to drop or transform routed messages after processing. |
| `TYPES.ClientRegistrationContribution` | You need behavior around client registration and initialization. |
| `TYPES.WebviewEndpointContribution` | You need endpoint-local setup after endpoint creation. |
| `ActionRequestHandlerRegistry` | You need to answer request actions in the extension host. |

## Boundaries

Keep generic runtime behavior in `big-vscode-contribution`.

Keep bigUML-specific behavior in consumer packages and attach it through
contribution points. The contribution package should depend only on generic GLSP
and VS Code integration APIs.
