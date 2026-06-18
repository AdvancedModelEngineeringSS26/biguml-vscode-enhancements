# Manual Verification

Use this guide to verify the final Feature 1 VS Code contribution runtime in
the extension development host.

## Recommended Test Files

Use two diagrams so active-client and multi-editor behavior are easy to see:

```text
client/workspace/asd/asd.uml
client/workspace/class_diagram/class_1768132987976.uml
```

Keep these VS Code surfaces visible where possible:

- custom UML editor
- `Properties`
- `Minimap`
- `Diagram Outline`
- `Problems`
- `Output`, using the `bigUML Modeling Tool` channel

## Setup

1. Open the repository workspace in VS Code.
2. Build the workspace if needed.
3. Start the extension from `client/application/vscode`.
4. Wait until the extension development host finishes activation.
5. Confirm the UML activity-bar view is available.
6. Open `client/workspace/asd/asd.uml` with the bigUML editor.
7. Open `client/workspace/class_diagram/class_1768132987976.uml` with the bigUML editor.

## Smoke Check

1. Click inside a diagram and confirm it renders.
2. Select a node.
3. Confirm `Properties` updates to the selected element.
4. Confirm `Diagram Outline` and `Minimap` follow the same diagram.
5. Move one node slightly.
6. Confirm the editor tab becomes dirty.
7. Save with `Ctrl+S`.
8. Confirm the dirty indicator clears.

## Multi-Editor And Selection

1. Open both recommended diagrams side by side.
2. Select an element in the first diagram.
3. Confirm `Properties`, `Diagram Outline`, and `Minimap` reflect the first diagram.
4. Select an element in the second diagram.
5. Confirm the same views switch to the second diagram.
6. Switch focus between the editors several times.
7. Confirm active-client dependent views follow the focused editor.
8. Close one editor.
9. Confirm the remaining editor still supports selection and side-panel updates.
10. Reopen the closed file and confirm it gets a fresh usable session.

## Document Lifecycle

1. Open a diagram.
2. Move a node and confirm the tab becomes dirty.
3. Save and confirm the dirty indicator clears.
4. Move the same node again.
5. Undo and confirm the node returns to the previous position.
6. Redo and confirm the edit is reapplied.
7. Run `File: Revert File` while the diagram editor is focused.
8. Confirm the diagram reloads from disk.
9. Close and reopen the file.
10. Confirm the persisted state is shown.

## Diagnostics

1. Open `asd.uml`.
2. Select a class node.
3. Change the class name to an invalid value such as `abc`.
4. Save if needed and wait for validation.
5. Open the `Problems` panel.
6. Confirm a marker appears for the UML file.
7. Change the class name to a valid value such as `ValidClass`.
8. Save if needed.
9. Confirm the marker clears or updates to a clean state.

## SVG Export

1. Open any UML diagram in the custom editor.
2. Run `bigUML: Export as SVG` from the Command Palette or editor title menu.
3. Pick a temporary output location.
4. Open the exported SVG file.
5. Confirm the file exists and contains the diagram drawing.

## Reload Safety

1. Open two UML diagrams.
2. Confirm both render and side panels follow the active editor.
3. Run `Developer: Reload Window`.
4. Wait for the development host to reload.
5. Reopen the diagrams if VS Code does not restore them automatically.
6. Confirm both diagrams reconnect and render again.
7. Select elements in both files and confirm the side panels switch correctly.
