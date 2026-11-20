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
