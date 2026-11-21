# Mythic Editor Architecture - Phase 1

Mythic Editor is an independent, mobile-first code editor engine written in TypeScript.

## 1. Design Principles

- **Zero Framework Dependency**: Core subsystems run purely in ES2022 JavaScript without browser globals or DOM dependencies.
- **Piece Tree Data Structure**: Document storage uses an augmented Red-Black Tree referencing slices within immutable string buffers, enabling $O(\log N)$ inserts and deletes without full text copying.
- **Clean Model Invariants**:
  - **Line numbers**: 1-based (`lineNumber >= 1`).
  - **Columns**: 1-based (`column >= 1`).
  - **Offsets**: 0-based in UTF-16 code units (consistent with JavaScript string indexing and LSP).
  - **Surrogate pairs**: Unicode astral characters (such as emojis) consist of 2 UTF-16 code units; piece chunk boundaries never split a high surrogate from a low surrogate.
  - **Ranges**: Always normalized (`start <= end`).
  - **Selections**: Directed ranges tracking both selection anchor and active cursor position (LTR or RTL).

## 2. Subsystems

```
src/
├── core/
│   ├── model/
│   │   ├── Position.ts           # (lineNumber, column) coordinates
│   │   ├── Range.ts              # Normalized start & end span
│   │   ├── Selection.ts          # Directional selection (LTR/RTL)
│   │   └── OffsetTransformer.ts  # UTF-16 code unit conversion
│   └── buffer/
│       ├── ITextBuffer.ts        # Storage abstraction interface
│       ├── PieceTreeTextBuffer.ts# High-level buffer wrapper
│       └── pieceTree/
│           ├── rbTree.ts         # Augmented balanced Red-Black tree
│           ├── lineStarts.ts     # EOL indexing
│           └── pieceTreeBase.ts  # Piece table implementation
├── syntax/
│   ├── index.ts                  # Syntax subsystem exports
│   └── TreeSitterHighlighter.ts  # WebAssembly Tree-sitter highlighter & tokens provider
├── view/
│   ├── FontMetrics.ts            # Monospace sub-pixel font measurement
│   ├── Viewport.ts               # Virtualized viewport scrolling math
│   ├── RenderedLinesCollection.ts# Line DOM recycling, virtualization & token spans
│   ├── ViewGutter.ts             # Line numbers column
│   ├── ViewCursor.ts             # Blinking caret overlay
│   ├── ViewSelection.ts          # Selection highlight rectangles
│   ├── InputController.ts        # Gboard/IME invisible textarea bridge
│   └── EditorView.ts             # Main view engine orchestrator
└── playground/                   # Interactive browser playground
```

## 3. Syntax Highlighting Architecture

Mythic Editor uses an extensible, WebAssembly-based **Tree-sitter** engine:
- **`TreeSitterHighlighter`**: Implements `ILineTokensProvider`, interfacing directly with official `web-tree-sitter` WebAssembly parsers.
- **AST Leaf Mapping**: Traverses the Concrete Syntax Tree (CST) and maps language-specific nodes to standard editor theme tokens (`keyword`, `function`, `string`, `comment`, `number`, `variable`, `type`, `operator`, `property`, `punctuation`).
- **Dynamic Language Switching**: Supports runtime language switching via `editor.setLanguage('python')` or during initialization `{ language: 'javascript' }`.
- **Multiline Range Slicing**: Splits multiline tokens (e.g. block comments, template strings) cleanly across individual virtualized viewport lines.

## 4. Future Roadmap

- **Phase 2**: View virtualization, DOM line rendering, and touch input controllers.
- **Native / Hybrid Engine**: Storage layer prepared to interface with high-performance WebAssembly or Rust piece tables if needed.
