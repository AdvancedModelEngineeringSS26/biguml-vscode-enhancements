# Feature 5 — Customization API: stylesheets and rendering plugins

## What we did and how

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

## Problems, missing parts, and future work

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
