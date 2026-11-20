# Third-Party Notices & Attribution

Mythic Editor incorporates and adapts algorithms from the following open-source project:

## Microsoft Monaco Editor / VS Code

- **Repository**: [https://github.com/microsoft/vscode](https://github.com/microsoft/vscode) / [https://github.com/microsoft/monaco-editor](https://github.com/microsoft/monaco-editor)
- **License**: MIT License
- **Copyright**: (c) Microsoft Corporation. All rights reserved.

### Adapted Components in Mythic Editor:
1. `src/core/buffer/pieceTree/rbTree.ts`:
   Adapted from `vs/editor/common/model/pieceTreeTextBuffer/rbTreeBase.ts`.
   Implements an augmented red-black tree maintaining subtree character sizes and line feed counts.
2. `src/core/buffer/pieceTree/lineStarts.ts`:
   Adapted from `vs/editor/common/model/pieceTreeTextBuffer/pieceTreeBase.ts`.
   Implements fast line break scanning (`\r`, `\n`, `\r\n`).
3. `src/core/buffer/pieceTree/pieceTreeBase.ts`:
   Adapted from `vs/editor/common/model/pieceTreeTextBuffer/pieceTreeBase.ts`.
   Implements a piece table buffer with chunk indexing, node splitting, and CRLF boundary validation, without external VS Code runtime dependencies.
4. `src/view/FontMetrics.ts`:
   Adapted from `vs/editor/browser/config/charWidthReader.js`.
   Implements sub-pixel character width measurement for monospace fonts.
5. `src/view/RenderedLinesCollection.ts`:
   Adapted from `vs/editor/browser/view/viewLayer.js`.
   Implements line DOM recycling and virtualization inside the visible viewport.
6. `src/view/ViewCursor.ts`:
   Adapted from `vs/editor/browser/viewParts/viewCursors/viewCursor.js`.
   Implements caret blinking and coordinate transformations.
7. `src/view/ViewSelection.ts`:
   Adapted from `vs/editor/browser/viewParts/selections/selections.js`.
   Implements multi-line selection overlay rectangle rendering.
8. `src/view/InputController.ts`:
   Adapted from `vs/editor/browser/controller/editContext/textArea/textAreaEditContextInput.js`.
   Implements invisible inputarea bridge for keyboard, Android Gboard, and IME composition events.
