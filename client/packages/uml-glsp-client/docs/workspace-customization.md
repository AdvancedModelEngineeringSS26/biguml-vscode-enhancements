# Workspace customization

The UML GLSP client loads workspace-specific styles and rendering plugins from
the workspace's `.glsp` directory:

```text
.glsp/
├── styles/
│   └── custom-theme.css
└── rendering/
    └── custom-view.js
```

## Stylesheets

CSS files in `.glsp/styles/` are converted to webview resource URIs and loaded
after the built-in styles. A file-system watcher reloads them when files are
created, changed, or deleted.

## Rendering plugins

JavaScript files in `.glsp/rendering/` are included as static
`<script type="module">` resources. Dynamic `import()` was not viable in the
webview sandbox. The workspace folder must be present in `localResourceRoots`,
and cache-busting is required to prevent stale workspace scripts.

The client bundle exposes the supported rendering API as `window.glspAPI`.
Plugins create a Sprotty `FeatureModule` and add it to `window.__glspPlugins`.
The client reads these modules when creating the diagram container, before the
first render, so plugins can call `overrideModelElement()` at the required time.

```js
const {
    FeatureModule,
    overrideModelElement,
    GClassNode,
    CLASS_TYPE
} = window.glspAPI;

window.__glspPlugins.push(
    new FeatureModule((bind, unbind, isBound, rebind) => {
        overrideModelElement(
            { bind, unbind, isBound, rebind },
            CLASS_TYPE,
            GClassNode,
            CustomClassView
        );
    })
);
```

## Limitations

- Rendering plugins are JavaScript-only and do not hot-reload.
- `window.glspAPI` is an informal, unversioned API rather than a typed SDK.
- Workspace plugins execute user-provided JavaScript without validation or
  additional sandboxing.
- TypeScript or TSX plugins would require a bundling or transpilation step.
