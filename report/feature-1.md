# Feature 1 — InversifyJS-based VS Code contribution runtime

## What we did

- Created the generic `big-vscode-contribution` package and registered its
  InversifyJS 6 module in bigUML's VS Code container.
- Split the former connector into focused services for client lifecycle,
  action routing and dispatching, document lifecycle, selection, diagnostics,
  progress, navigation, SVG export, and endpoint creation.
- Migrated consumers where possible. `BigGlspVSCodeConnector` remains as a
  deprecated compatibility facade during the transition.

## How we solved it

`VscodeActionHandler` is a multi-bound contribution point: `ActionRouter`
selects exactly one handler for an incoming GLSP action kind and rejects
duplicate registrations. Further extension points support message filtering,
client-registration hooks, and endpoint initialization. `WebviewEndpointFactory`
creates endpoints in child containers, allowing endpoint-scoped dependencies.

## Problems, missing parts, and future work

The upstream connector mixed transport, editor lifecycle, document state, and
VS Code UI concerns, making isolated changes difficult. Existing bigUML packages
also depended on its broad API, so migration must remain incremental. Future work
is to migrate the remaining consumers, remove the compatibility facade, add
service-level tests, and prepare the generic package for upstream contribution.

The new architecture has more DI bindings, but its explicit extension points are
preferable to adding new connector subclasses.

Further details: [architecture](../client/packages/big-vscode-contribution/docs/architecture.md),
[migration guide](../client/packages/big-vscode-contribution/docs/migration-guide.md), and
[manual verification](../client/packages/big-vscode-contribution/docs/manual-verification.md).
