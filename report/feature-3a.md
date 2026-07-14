# Feature 3 — VS Code native-integration fixes and audit

## What we did

We focused on custom-editor lifecycle behaviour and keybinding conflicts.

- GLSP now edits an isolated temporary restore model rather than the source
  `.uml` file directly. Save copies the current model to the source; backup,
  revert, discard, and cleanup operate on the temporary model. This prevents
  **Don't Save** from persisting unsaved edits.
- Diagram commands are scoped with `activeCustomEditorId` and a
  `glspDiagramFocused` context key. GLSP focus changes are forwarded to the
  extension host, which updates that key with `setContext`; undo/redo also avoid
  text-input focus.

## VS Code API audit and outcome

`CustomEditorProvider` lifecycle hooks (`open`, `resolve`, save, backup, revert,
and dispose), `workspace.fs`, custom context keys, and keybinding `when` clauses
are applicable and used. `activeCustomEditorId` is the appropriate built-in
editor context; there is no public `window.activeCustomEditor` API.

VS Code does not provide a native diagram-selection API; GLSP selection must be
exposed through extension-specific actions/context. Text-editor decorations and
document links are not directly applicable to a canvas custom editor. Breadcrumbs,
workspace-trust handling, and a detailed Theia comparison were not investigated
in this contribution and remain documentation work.

## Problems, missing parts, and future work

The custom-editor lifecycle is improved, but model reload after revert is still
unreliable despite reload-related server experiments. Viewport persistence was
not implemented. Some shortcuts (search and element navigation) still reach the
webview but do not complete their GLSP command/action path, so they need separate
command-handler debugging. Future work is to complete the remaining API audit,
fix reload, persist viewport state by document URI, and investigate native
selection integration.

The full lifecycle code is necessarily more complex because VS Code requires a
`CustomEditorProvider` to own save, backup, and revert semantics. Isolating the
working model is the key architectural boundary that makes those semantics safe.
