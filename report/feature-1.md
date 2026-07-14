# Feature 1 — InversifyJS-based VS Code contribution runtime

## What we did

- Created the generic `big-vscode-contribution` package and integrated its
  `createVscodeContributionModule()` into bigUML's VS Code dependency-injection
  container.
- Replaced the responsibilities of the former monolithic connector with focused
  services for client lifecycle, action routing/dispatching, selection, document
  lifecycle, diagnostics, progress, navigation, SVG export, and webview endpoint
  creation.
- Migrated consumers to the new action runtime where possible. The former
  `BigGlspVSCodeConnector` remains as a deprecated compatibility facade so that
  existing features continue to work during migration.

## How we solved it

- Used InversifyJS 6 bindings and singleton services in one composition module.
- Introduced `VscodeActionHandler` as a multi-bound contribution point. The
  `ActionRouter` selects a handler by GLSP action kind; duplicate registrations
  fail explicitly instead of silently choosing an order-dependent handler.
- Added separate contribution points for message propagation, client
  registration, and endpoint initialization. This lets product-specific packages
  extend the generic runtime without importing or subclassing its connector.
- Used `WebviewEndpointFactory` to create an endpoint in a child container,
  allowing endpoint-scoped dependencies and contributions.

## Problems encountered

- The upstream design concentrated unrelated behaviour and direct object
  creation in one connector, so separating concerns required preserving several
  established lifecycle and message-routing contracts.
- Existing bigUML packages depended on the old broad connector API. A gradual
  migration was necessary; the compatibility facade avoids a disruptive,
  all-at-once change.

## Missing parts and future work

- Complete removal of the deprecated compatibility facade after all consumers
  use the contribution-native APIs.
- Extract the generic package for potential upstream contribution once its API
  has stabilised.

## Architecture assessment

The original connector was difficult to customise and test because it combined
transport, editor lifecycle, document state, and action-specific VS Code UI
behaviour. The new boundaries make these concerns replaceable, but they also
introduce more DI bindings to maintain. New features should use the documented
contribution points rather than adding another connector subclass.

## Further documentation

- [Architecture](client/packages/big-vscode-contribution/docs/architecture.md)
  explains the service catalogue, runtime flows, and extension points.
- [Migration guide](client/packages/big-vscode-contribution/docs/migration-guide.md)
  maps legacy connector APIs to the new services.
- [Manual verification](client/packages/big-vscode-contribution/docs/manual-verification.md)
  lists the smoke, multi-editor, lifecycle, diagnostics, export, and reload checks.
