# Migration Guide

This guide maps legacy `big-vscode` connector usage to the
`big-vscode-contribution` services.

Compatibility APIs may remain for frozen consumers, but new connector/runtime
work should use the contribution-native services directly.

## Service Mapping

| Previous usage | Preferred service |
| --- | --- |
| `BigGlspVSCodeConnector` for many unrelated tasks | Split by responsibility across the services below. |
| `connector.clients` | `ClientManager.clients` |
| `connector.activeClient` | `ClientManager.activeClient` |
| `connector.clientIdByDocument(document)` | `ClientManager.getClientId(document)` |
| `connector.registerClient(client)` | `VscodeConnector.registerClient(client, options)` |
| `connector.dispatchAction(action, clientId?)` | `ActionDispatcher.dispatch(action, clientId)` |
| `connector.saveDocument(document, destination?)` | `VscodeConnector.saveDocument(document, destination)` |
| `connector.revertDocument(document, diagramType)` | `VscodeConnector.revertDocument(document, diagramType)` |
| `connector.onDidRegister` | `ClientManager.onDidRegister` or `VscodeConnector.onDidRegister` |
| `connector.onDidDispose` | `ClientManager.onDidDispose` or `VscodeConnector.onDidDispose` |
| `connector.onDidChangeCustomDocument` | `VscodeConnector.onDidChangeCustomDocument` |
| direct connector message-processing overrides | `VscodeActionHandler` and `MessagePropagationFilter` |
| direct `WebviewEndpoint` construction | `WebviewEndpointFactory.create(options)` |

## Dispatch Actions

Legacy code often dispatches through a broad connector or wrapper service:

```ts
this.dispatcher.dispatch(MyAction.create());
this.dispatcher.dispatchToClient(clientId, MyAction.create());
```

Contribution-native code should target the contribution dispatcher:

```ts
this.actionDispatcher.dispatch(MyAction.create(), clientId);
```

If the action belongs to the currently focused editor command, the `clientId`
can be omitted:

```ts
this.actionDispatcher.dispatch(MyAction.create());
```

## Send Requests

```ts
const response = await this.actionDispatcher.request(MyRequestAction.create(), clientId);
```

The request action gets a request ID if it does not already have one. The
dispatcher resolves when the matching response action is observed.

## Observe Actions

Use `ActionListener` instead of connector action streams:

```ts
this.actionListener.registerListener(message => {
    // client action
});

this.actionListener.registerServerListener(message => {
    // server action
});

this.actionListener.registerVSCodeListener(message => {
    // extension-host handled action
});
```

## Register Extension-Host Request Handlers

Use `ActionRequestHandlerRegistry` when the extension host answers a GLSP
request:

```ts
this.requests.handleVSCodeRequest(MyRequestAction.KIND, async message => {
    return MyResponseAction.create(message.action.requestId);
});
```

The registry marks the request kind as extension-host handled and dispatches the
response to the originating client.

## Work With Clients

Use `ClientManager` for client state:

```ts
const activeClient = this.clientManager.activeClient;
const clientId = this.clientManager.getClientId(document);
const client = this.clientManager.getClient(clientId);
```

Use `VscodeConnector` only when you need high-level connector orchestration such
as registration, save, or revert.

## Add Action-Specific Behavior

Do not add new `processMessage` branches or connector subclasses. Bind a focused
handler:

```ts
@injectable()
class MyActionHandler implements VscodeActionHandler {
    readonly actionKinds = [MyAction.KIND] as const;

    handle(message: ActionMessage, client: GlspVscodeClient | undefined, origin: MessageOrigin): MessageProcessingResult {
        // Process one focused action family.
        return unchangedMessage(message);
    }
}

bind(TYPES.VscodeActionHandler).to(MyActionHandler).inSingletonScope();
```

Only one handler may match an action kind. `ActionRouter` throws if multiple
handlers claim the same kind.

## Drop Or Transform Routed Messages

Use a propagation filter when action handling is not enough and forwarding rules
need to change:

```ts
@injectable()
class MyMessageFilter implements VscodeMessagePropagationFilter {
    filter(message: unknown, origin: MessageOrigin): unknown | undefined {
        if (origin === 'client' && shouldDrop(message)) {
            return undefined;
        }
        return message;
    }
}

bind(TYPES.MessagePropagationFilter).to(MyMessageFilter).inSingletonScope();
```

Filters run after action routing and before the message is propagated to the
next transport target.

## Customize Client Or Endpoint Initialization

Use `ClientRegistrationContribution` for client-level setup:

```ts
@injectable()
class MyClientContribution implements ClientRegistrationContribution {
    onClientRegistered(client: GlspVscodeClient): Disposable | undefined {
        return client.webviewEndpoint.onActionMessage(message => {
            // Client-specific setup.
        });
    }
}
```

Use `WebviewEndpointContribution` for endpoint-local setup:

```ts
@injectable()
class MyEndpointContribution implements WebviewEndpointContribution {
    onEndpointInitialized(endpoint: VscodeWebviewEndpoint): Disposable | undefined {
        return endpoint.onActionMessage(message => {
            // Endpoint-specific setup.
        });
    }
}
```

## Create Endpoints

```ts
const endpoint = this.webviewEndpointFactory.create(options);
```

The factory creates an endpoint-scoped child container and runs all endpoint
contributions. New code should not instantiate endpoints directly.
