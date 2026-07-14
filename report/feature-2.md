# Feature 2 — Native extension-host action handling

## What we did and how

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

## Problems, missing parts, and future work

Replacing the old connector at once would have risked regressions, so it remains
as a compatibility layer while consumers migrate. Pending requests are rejected
when a client is disposed, but explicit timeout/cancellation support and
automated multi-client tests are still missing. Future consumers should inject
the native services directly; the compatibility layer can then be removed.

This separation makes client ownership, dispatching, observation, and request
handling independently testable instead of coupling them to one connector.
