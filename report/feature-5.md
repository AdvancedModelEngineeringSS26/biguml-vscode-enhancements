
# Feature 5 — Customization API: Stylesheets & Rendering Plugins
  

**Package:** `uml-glsp-client` (editor provider + webview) · `uml-glsp-server` (element CSS classes) · `big-tool-palette`

## What we did

A plugin/customization layer for the GLSP diagram webview, driven entirely by a `.glsp/` folder in the workspace root — no rebuild needed:

- **Part A — Custom stylesheets:** every `.glsp/styles/*.css` is auto-injected into the webview `<head>`, loaded *after* the built-in styles so it can override them. Includes **hot reload**.

- **Part B — Rendering plugins:** every `.glsp/rendering/*.js` is loaded as an ES module that can override how elements are drawn (e.g. render a `Class` as a circle).

- **Follow-up — Color picker:** a practical, UI-driven alternative to raw plugins — pick a colour per element type from the tool palette.
## How we solved it

**Stylesheets** (`editor.webview-editor-provider.ts`): `collectCustomStyleLinks()` scans `.glsp/styles`, keeps only `.css` files, and maps each to a `webview.asWebviewUri()` link handed to `ReactHtmlProvider`. `getLocalResourceRoots()` was extended with the workspace folder so the webview is allowed to read those files. Hot reload uses `workspace.createFileSystemWatcher('.glsp/styles/*.css')`; on create/change/delete it re-collects links and re-renders the HTML with a cache-bust comment.

**Rendering plugins** — we went past research and implemented **Option A (dynamic module in webview)**:

1. Extension host scans `.glsp/rendering/*.js`, converts each to a cache-busted webview URI, and injects `<script type="module">` tags after the main bundle.

2. `UmlStarter` exposes GLSP/Sprotty APIs on `window.glspAPI` (`FeatureModule`, `overrideModelElement`, `svg`, `RectangularNodeView`, `GClassNode`, `injectable`, …) so plugins need no imports.

3. Plugins push a `FeatureModule` onto `window.__glspPlugins`; `createContainer()` spreads that array into `createUmlDiagramContainer()` **before** the DI container is built — solving the "override must happen during container init" timing problem. `overrideModelElement()` then swaps the view.


**Color picker**: server-side element views got stable CSS classes (`uml-class-node`, …). The palette button opens a panel of `<input type=color>` rows; choices persist in `localStorage` and are applied by injecting one `<style>` block — reusing the Part A styling channel instead of the heavier plugin path.

## Diagram

```

.glsp/styles/*.css ─► scan ─► asWebviewUri ─► <link> in <head> (after built-ins) ─┐

.glsp/rendering/*.js ► scan ─► asWebviewUri ─► <script type=module> ├─► Webview

└► window.glspAPI ► push FeatureModule ► window.__glspPlugins ► createContainer()

Color picker (palette) ► localStorage ► injected <style> ──────────────────────────┘

```

## Problems encountered

- **CSP / resource scope:** the webview couldn't read workspace files until the workspace folder was added to `localResourceRoots`.

- **DI timing:** overrides must run *before* the first render; solved with the `window.__glspPlugins` handoff consumed inside `createContainer()`.

- **API exposure:** plugins can't `import` bundled deps, so we expose a curated `window.glspAPI` global.

- **Caching:** VS Code aggressively caches webview HTML/scripts — worked around with `?v=Date.now()` and a cache-bust comment on reload.

- Minor build breakage during merges (`DisposableCollection` import, duplicated code) later cleaned up.

## What's missing

- Rendering plugins accept **`.js` only** — no in-host `.tsx`/esbuild bundling (Option B) or `plugin-manifest.json` (Option C).

- `window.glspAPI` surface is small/hand-picked; complex views needing other GLSP internals aren't reachable.

- No hot reload for rendering plugins (styles only). No validation/sandboxing of plugin JS.

- Color choices live in `localStorage` (per-machine), not in the workspace.

## Future work

Add an esbuild step to accept `.tsx` and a declarative manifest; widen or version the plugin SDK; add plugin hot reload and basic validation; persist colours into `.glsp/`.

## Architecture notes & recommendations

The `.glsp/` convention is clean and the injection point in the editor provider is the right seam. Weak spots: leaning on `window` globals for API handoff is fragile and untyped, and `resolveHtml` does string `.replace()` on the HTML — a structured HTML/CSP builder would be safer. Recommendation: ship a small typed `@biguml/plugin-sdk` so plugins import real types instead of reaching into `window`.