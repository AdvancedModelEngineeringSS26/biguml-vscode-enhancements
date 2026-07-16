# Rendering Plugin System — Research Document

## Overview

This document records the research and implementation findings for **Part B of Feature 5**: allowing third parties to override diagram element rendering in a GLSP-based VS Code editor by providing custom Sprotty views loaded from workspace files.

---

## Research Questions

### 1. How do other third-party plugin systems work?

VS Code extensions are typically loaded via Node.js `require()` in the extension host process, granting full access to the VS Code API and Node.js runtime. However, this model is not directly applicable to webviews because they run in a sandboxed browser context.

Browser-based plugin systems usually employ one of the following:

- **`eval()` / `new Function(string)`**: Executes arbitrary code strings but is often blocked by strict Content Security Policies (CSP).    
- **Dynamic `import(url)`**: Loads ES modules from a URL; works in modern browsers but is subject to CSP `script-src` restrictions.   
- **`<script>` tag injection**: Adds tags to the DOM at runtime, also subject to CSP.
- **Bundling at build time**: Plugin code is discovered and bundled into the HTML before the webview loads.

### 2. Can we use dynamic `import()` in a webview?

Research indicates this is **not viable as-is**.

- While the webview CSP allows `vscode-resource:` URIs, `import()` inside an ES module is treated as a dynamic navigation.
- VS Code’s webview sandboxing blocks these dynamic imports regardless of CSP due to the iframe's sandbox attribute configuration.
- Additionally, dynamic modules cannot easily access the parent module's scope.

### 3. Can we use static `<script type="module" src="...">` instead?

**Finding: Yes**, this is the viable approach. The extension host can discover plugin files before generating the HTML, convert them to `vscode-resource:` URIs, and inject them as static module tags.

**Why it works:**

- Static module scripts are allowed by `${webview.cspSource}`.
- ES modules execute in document order, ensuring `bundle.js` runs before plugin scripts.
- **Requirement**: The workspace folder must be included in `localResourceRoots`.
- **Cache Issue**: A `?v=<timestamp>` query parameter is necessary to prevent the webview from caching old workspace script versions.

### 4. How to provide GLSP/Sprotty APIs to plugin code?

Plugins require various classes and functions from `@eclipse-glsp/client`.

|**Option**|**Approach**|**Verdict**|
|---|---|---|
|**A**|Expose APIs as `window.glspAPI` from the main bundle|✅ **Used**|
|**B**|Use import maps to resolve `@eclipse-glsp/client`|❌ Not supported in VS Code|
|**C**|Provide a plugin SDK as a separate package|Viable long-term, too heavy now|

**Implementation Details:** In `uml-starter.ts`, APIs are assigned to `window.glspAPI` synchronously before any class definitions:

TypeScript

```
// uml-starter.ts — executed synchronously at module load
(window as any).glspAPI = {
    FeatureModule,
    overrideModelElement,
    svg,
    RectangularNodeView,
    GClassNode,
    injectable: inversify.injectable,
    CLASS_TYPE: ClassDiagramNodeTypes.CLASS
};
```

### 5. How does `overrideModelElement()` work and how is timing solved?

Overrides must occur inside a `FeatureModule` passed to `createUmlDiagramContainer()` during construction, before the first render.

**The Timing Solution:** Plugin scripts (as module tags) execute after HTML parsing, while `createContainer()` is triggered asynchronously by the GLSP handshake message. This ensures plugins finish executing before the container is built.

**The Mechanism:**

1. Plugins push `FeatureModule` instances onto `window.__glspPlugins`.
2. `createContainer()` reads and spreads this array into the diagram container.

TypeScript

```
// uml-starter.ts
createContainer(...containerConfiguration: ContainerConfiguration): inversify.Container {
    const pluginModules: ContainerConfiguration = (window as any).__glspPlugins ?? [];
    return createUmlDiagramContainer(
        ...containerConfiguration,
        ...pluginModules  // plugin FeatureModules injected here
    );
}

// plugin file
window.__glspPlugins.push(new FeatureModule((bind, unbind, isBound, rebind) => {
    overrideModelElement({ bind, unbind, isBound, rebind }, CLASS_TYPE, GClassNode, CustomClassView);
}));
```

---

## What Was Tried and What Worked

| **Attempt**                                       | **Result**         |
| ------------------------------------------------- | ------------------ |
| Dynamic `import()` in webview                     | Blocked by sandbox |
| Static `<script type="module" src="...">`         | Works              |
| `window.glspAPI` for API sharing                  | Works              |
| `window.__glspPlugins` array for injection        | Works              |
| Timing: Plugins pushed before `createContainer()` | Verified           |
| `localResourceRoots` configuration                | Required           |
| Cache-busting (`?v=Date.now()`)                   | Required           |

---

## What Would Need to Change Upstream

- **Formal Contract**: `window.glspAPI` is currently informal; a stable, versioned surface is needed for production.
- **Transpilation**: Support for `.ts` or `.tsx` would require a build step (like `esbuild`) in the extension host.
- **Security**: Plugins currently run with full privileges; a production system would need sandboxing.
- **Hook Preservation**: Upstream GLSP projects must ensure `createContainer()` remains overridable.

---

## Recommendation

**Option A** is the most viable for the current architecture as it avoids CSP issues and integrates with the DI container lifecycle.

**Future Evolution:**

- Define a typed `GlspPluginAPI` interface.
- Enable `.ts` support via runtime transpilation.
- Implement a `plugin-manifest.json` for override declarations and validation.