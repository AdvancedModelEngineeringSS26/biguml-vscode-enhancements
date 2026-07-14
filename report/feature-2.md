# Feature 2 – Native Extension Host Action Handling

## Overview

Feature 2 introduces a native extension-host runtime for action handling inside the VS Code extension. Instead of relying on a single connector to coordinate communication between webviews, VS Code, and the GLSP server, the implementation separates these responsibilities into dedicated runtime components. This results in a cleaner architecture, improves maintainability, and simplifies future extensions.

The goal of this feature was to provide a unified mechanism for dispatching actions, handling request-response communication, routing messages, and managing connected clients while maintaining compatibility with the existing codebase during the migration.

```
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

*Figure 1. High-level architecture of the native extension-host action runtime.*

---

## Design and Implementation

The implementation introduces a dedicated runtime inside the `big-vscode-contribution` package consisting of several core components.

- **ActionDispatcher** dispatches actions to the GLSP server, individual webview clients, or the extension host. It also manages asynchronous request-response communication by correlating requests and responses using unique request identifiers.
- **ActionListener** exposes typed listeners for actions originating from clients, the GLSP server, or the extension host. Extension-host handled requests are processed through the `ActionRequestHandlerRegistry`.
- **ActionRouter** acts as the central routing component and forwards actions to the appropriate destination while preserving client context.
- **ClientManager** manages client registration, lookup, active client tracking, and lifecycle management, becoming the single source of truth for connected GLSP clients.

To make the communication flow more explicit, dedicated `dispatchToClient()` and `dispatchToServer()` APIs were introduced. A request-capable webview protocol was also implemented, allowing sidebar webviews to perform native request-response communication instead of relying solely on notification-based messaging.

Several existing consumers were migrated to the native runtime during the implementation, including the webview bridge, outline provider, revision management, and Advanced Search. Advanced Search was specifically migrated to the new request-response workflow to validate the complete communication path between sidebar webviews, the extension host, and GLSP clients.

The previous connector implementation remains only as a lightweight compatibility layer, allowing incremental migration without disrupting existing functionality.

---

## Validation

The implementation was validated through build verification and manual runtime testing.

The project builds successfully without errors, and existing functionality remained operational after the migration. Existing and newly created UML diagrams function correctly, while the property palette, minimap, revision management, and Advanced Search continue to work as expected. The migrated Advanced Search implementation also validates the complete request-response workflow introduced by the native runtime.

---

## Challenges

The primary challenge was introducing the new runtime without breaking existing functionality. Since many components depended on the previous connector implementation, replacing it directly would have introduced a significant risk of regressions.

To address this, the migration was performed incrementally. Existing functionality continued to operate through a compatibility layer while individual components were gradually migrated to the new runtime. Another challenge was ensuring that asynchronous requests were correctly correlated with the originating client when multiple webviews were active simultaneously.

---

## Remaining Improvements

The implemented runtime fulfills the core requirements of Feature 2. The remaining work mainly consists of engineering improvements rather than additional runtime functionality. Future engineering improvements could include:

- Introducing automated tests for the runtime components.
- Extending timeout and cancellation handling for pending requests.
- Removing the remaining compatibility layer once all consumers rely exclusively on the native runtime.

---

## Future Work

Potential future improvements include:

- Introducing automated unit tests for the native runtime.
- Improving request timeout and cancellation handling.
- Migrating future components directly to the native runtime.
- Removing the remaining compatibility layer once it is no longer required.

---

## Architecture Feedback

Separating client management, action routing, and request handling into dedicated runtime components significantly improved the overall architecture. Compared to the previous connector-centric approach, the new design provides clearer responsibilities, reduces coupling between components, and makes future extensions considerably easier to implement and maintain.

The incremental migration strategy also allowed new functionality to be introduced without affecting existing users, making the transition safer and easier to validate.