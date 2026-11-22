/**
 * Mythic Editor - High-Performance View Engine
 *
 * Coordinates the virtualized viewport, line rendering, cursor, selection overlays,
 * and mobile/desktop input controllers.
 */

import { ITextBuffer } from '../core/buffer/ITextBuffer';
import { Position } from '../core/model/Position';
import { Selection } from '../core/model/Selection';
import { OffsetTransformer } from '../core/model/OffsetTransformer';
import { FontMetrics, IFontMetrics } from './FontMetrics';
import { Viewport } from './Viewport';
import { RenderedLinesCollection, ILineTokensProvider } from './RenderedLinesCollection';
import { ViewGutter } from './ViewGutter';
import { ViewCursor } from './ViewCursor';
import { ViewSelection } from './ViewSelection';
import { InputController } from './InputController';
import { AutoClosingPairs } from './AutoClosingPairs';
import { EditStack } from '../core/model/EditStack';
import { TextChange } from '../core/model/TextChange';
import { LanguageConfigurationRegistry } from '../core/language/LanguageConfigurationRegistry';
import './editor.css';

export interface IEditorOptions {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  languageId?: string;
  filename?: string;
  tokensProvider?: ILineTokensProvider;
  onDidChangeContent?: (buffer: ITextBuffer) => void;
  onSave?: (content: string) => void;
}

export class EditorView {
  readonly rootElement: HTMLElement;
  private readonly scrollContainer: HTMLElement;
  private readonly canvas: HTMLElement;
  private readonly linesContent: HTMLElement;

  private buffer: ITextBuffer;
  private viewport: Viewport;
  private metrics: IFontMetrics;
  private options: IEditorOptions;

  private linesCollection: RenderedLinesCollection;
  private gutter: ViewGutter;
  private cursor: ViewCursor;
  private selectionOverlay: ViewSelection;
  private inputController: InputController;

  private selection: Selection = new Selection(1, 1, 1, 1);
  private isPointerDown: boolean = false;
  private selectionAnchor: Position = new Position(1, 1);
  private maxLineWidth: number = 0;
  private editStack: EditStack = new EditStack();
  private languageId: string = 'plaintext';

  constructor(targetElement: HTMLElement, buffer: ITextBuffer, options: IEditorOptions = {}) {
    this.buffer = buffer;
    this.options = options;

    const registry = LanguageConfigurationRegistry.getInstance();
    if (options.filename) {
      this.languageId = registry.getLanguageIdByFilename(options.filename);
    } else if (options.languageId || (options as any).language) {
      this.languageId = options.languageId || (options as any).language;
    }

    // 1. Measure Font
    this.metrics = FontMetrics.measure(
      options.fontFamily ?? 'ui-monospace, SFMono-Regular, Menlo, monospace',
      options.fontSize ?? 14,
      options.lineHeight
    );

    // 2. Initialize Viewport (Monaco layout info computation)
    this.viewport = new Viewport(this.metrics.lineHeight, this.metrics.charWidth);
    this.viewport.gutterWidth = this.viewport.computeGutterWidth(this.buffer.getLineCount());

    // 3. Construct DOM structure
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'mythic-editor';
    this.rootElement.style.fontSize = `${this.metrics.fontSize}px`;

    this.scrollContainer = document.createElement('div');
    this.scrollContainer.className = 'mythic-scroll-container';

    this.canvas = document.createElement('div');
    this.canvas.className = 'mythic-canvas';

    this.linesContent = document.createElement('div');
    this.linesContent.className = 'mythic-lines-content';
    this.linesContent.style.left = `${this.viewport.gutterWidth}px`;

    // 4. Subsystem Components
    let initialTokensProvider = options.tokensProvider;
    if (initialTokensProvider && 'update' in initialTokensProvider && typeof (initialTokensProvider as any).update === 'function') {
      (initialTokensProvider as any).update(this.buffer);
    }

    this.gutter = new ViewGutter(this.viewport);
    this.linesCollection = new RenderedLinesCollection(this.linesContent, this.viewport, initialTokensProvider);
    this.cursor = new ViewCursor(this.viewport);
    this.selectionOverlay = new ViewSelection(this.viewport);

    // Input Controller
    this.inputController = new InputController(this.viewport, {
      onType: (text) => this.handleType(text),
      onDeleteBackward: () => this.handleDeleteBackward(),
      onDeleteForward: () => this.handleDeleteForward(),
      onEnter: () => this.handleEnter(),
      onTab: () => this.handleType('    '),
      onArrow: (dir, shift) => this.handleArrow(dir, shift),
      onSave: () => this.options.onSave?.(this.buffer.getText()),
      onUndo: () => this.undo(),
      onRedo: () => this.redo()
    });

    // Assemble DOM
    this.linesContent.appendChild(this.selectionOverlay.container);
    this.linesContent.appendChild(this.cursor.element);
    this.linesContent.appendChild(this.inputController.textArea);

    this.canvas.appendChild(this.gutter.container);
    this.canvas.appendChild(this.linesContent);
    this.scrollContainer.appendChild(this.canvas);
    this.rootElement.appendChild(this.scrollContainer);
    targetElement.appendChild(this.rootElement);

    // 5. Setup Listeners
    this.bindEvents();

    // 6. Initial Layout & Render
    this.maxLineWidth = this.computeMaxLineWidth();
    this.layout();
    this.render();
  }

  getBuffer(): ITextBuffer {
    return this.buffer;
  }

  setBuffer(newBuffer: ITextBuffer): void {
    this.buffer = newBuffer;
    this.editStack.clear();
    const provider = this.linesCollection.getTokensProvider();
    if (provider && 'update' in provider && typeof (provider as any).update === 'function') {
      (provider as any).update(this.buffer);
    }
    this.maxLineWidth = this.computeMaxLineWidth();
    this.viewport.gutterWidth = this.viewport.computeGutterWidth(this.buffer.getLineCount());
    this.gutter.container.style.width = `${this.viewport.gutterWidth}px`;
    this.linesContent.style.left = `${this.viewport.gutterWidth}px`;
    this.linesCollection.flush();
    this.gutter.flush();
    this.selection = new Selection(1, 1, 1, 1);
    this.scrollContainer.scrollTop = 0;
    this.scrollContainer.scrollLeft = 0;
    this.viewport.scrollTop = 0;
    this.viewport.scrollLeft = 0;
    this.layout();
    this.render();
  }

  setTokensProvider(provider: ILineTokensProvider | null): void {
    if (provider && 'update' in provider && typeof (provider as any).update === 'function') {
      (provider as any).update(this.buffer);
    }
    this.linesCollection.setTokensProvider(provider);
    this.linesCollection.refresh(this.buffer);
    this.render();
  }

  setLanguage(langOrFilename: string): void {
    const registry = LanguageConfigurationRegistry.getInstance();
    const resolvedLang = langOrFilename.includes('.')
      ? registry.getLanguageIdByFilename(langOrFilename)
      : langOrFilename;

    this.languageId = resolvedLang;
    const grammarName = registry.getGrammarName(resolvedLang);

    const currentProvider = this.linesCollection.getTokensProvider();
    if (currentProvider && 'setLanguage' in currentProvider && typeof (currentProvider as any).setLanguage === 'function') {
      (currentProvider as any).setLanguage(grammarName);
      if ('update' in currentProvider && typeof (currentProvider as any).update === 'function') {
        (currentProvider as any).update(this.buffer);
      }
      this.linesCollection.refresh(this.buffer);
      this.render();
    }
  }

  getLanguageId(): string {
    return this.languageId;
  }

  toggleLineComment(): boolean {
    const registry = LanguageConfigurationRegistry.getInstance();
    const comments = registry.getComments(this.languageId);
    const token = comments?.lineComment;
    if (!token) return false;

    const prefix = token.endsWith(' ') ? token : token + ' ';
    const startLine = Math.min(this.selection.selectionStartLineNumber, this.selection.positionLineNumber);
    const endLine = Math.max(this.selection.selectionStartLineNumber, this.selection.positionLineNumber);

    let allCommented = true;
    for (let line = startLine; line <= endLine; line++) {
      const content = this.buffer.getLineContent(line);
      const trimmed = content.trimStart();
      if (trimmed.length > 0 && !trimmed.startsWith(token)) {
        allCommented = false;
        break;
      }
    }

    this.editStack.pushStackElement();

    for (let line = startLine; line <= endLine; line++) {
      const content = this.buffer.getLineContent(line);
      const startOffset = this.buffer.getOffsetAt(new Position(line, 1));

      if (allCommented) {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = content.match(new RegExp(`^(\\s*)${escaped}\\s?`));
        if (match) {
          const deleteLen = match[0].length - match[1].length;
          const deleteOffset = startOffset + match[1].length;
          this.buffer.delete(deleteOffset, deleteLen);
          this.editStack.pushEdit(
            this.selection,
            this.selection,
            new TextChange(deleteOffset, match[0].slice(match[1].length), deleteOffset, '')
          );
        }
      } else {
        const match = content.match(/^(\s*)/);
        const indentLen = match ? match[1].length : 0;
        const insertOffset = startOffset + indentLen;
        this.buffer.insert(insertOffset, prefix);
        this.editStack.pushEdit(
          this.selection,
          this.selection,
          new TextChange(insertOffset, '', insertOffset, prefix)
        );
      }
    }

    this.editStack.pushStackElement();
    this.updateCanvasHeight();
    this.refreshLines();
    this.render();
    this.options.onDidChangeContent?.(this.buffer);
    return true;
  }

  getTokensProvider(): ILineTokensProvider | null {
    return this.linesCollection.getTokensProvider();
  }

  private refreshLines(): void {
    const provider = this.linesCollection.getTokensProvider();
    if (provider && 'update' in provider && typeof (provider as any).update === 'function') {
      (provider as any).update(this.buffer);
    }
    this.linesCollection.refresh(this.buffer);
  }

  focus(): void {
    this.inputController.focus();
  }

  blur(): void {
    this.inputController.blur();
  }

  getSelection(): Selection {
    return this.selection;
  }

  setSelection(newSelection: Selection): void {
    this.selection = newSelection;
    this.cursor.updatePosition(newSelection.getPosition());
    this.inputController.updatePosition(newSelection.getPosition());
    this.selectionOverlay.update(newSelection, this.buffer);
    this.gutter.update(
      this.viewport.getVisibleLines(this.buffer.getLineCount()).startLineNumber,
      this.viewport.getVisibleLines(this.buffer.getLineCount()).endLineNumber,
      newSelection.positionLineNumber
    );
  }

  typeText(text: string): void {
    this.handleType(text);
  }

  handleKey(key: string): boolean {
    switch (key.toUpperCase()) {
      case 'UP':
        this.handleArrow('up', false);
        return true;
      case 'DOWN':
        this.handleArrow('down', false);
        return true;
      case 'LEFT':
        this.handleArrow('left', false);
        return true;
      case 'RIGHT':
        this.handleArrow('right', false);
        return true;
      case 'TAB':
        this.handleType('  ');
        return true;
      case 'ENTER':
        this.handleEnter();
        return true;
      case 'BACKSPACE':
        this.handleDeleteBackward();
        return true;
      case 'DELETE':
        this.handleDeleteForward();
        return true;
      case 'HOME': {
        const currentPos = this.selection.getPosition();
        this.setSelection(new Selection(currentPos.lineNumber, 1, currentPos.lineNumber, 1));
        return true;
      }
      case 'END': {
        const currentPos = this.selection.getPosition();
        const endCol = this.buffer.getLineLength(currentPos.lineNumber) + 1;
        this.setSelection(new Selection(currentPos.lineNumber, endCol, currentPos.lineNumber, endCol));
        return true;
      }
      case 'PGUP': {
        const visibleLines = Math.max(1, Math.floor(this.viewport.height / this.viewport.lineHeight));
        const currentPos = this.selection.getPosition();
        const targetLine = Math.max(1, currentPos.lineNumber - visibleLines);
        this.revealLine(targetLine, currentPos.column, true);
        return true;
      }
      case 'PGDN': {
        const visibleLines = Math.max(1, Math.floor(this.viewport.height / this.viewport.lineHeight));
        const currentPos = this.selection.getPosition();
        const targetLine = Math.min(this.buffer.getLineCount(), currentPos.lineNumber + visibleLines);
        this.revealLine(targetLine, currentPos.column, true);
        return true;
      }
      case 'ESC':
        this.blur();
        return true;
      default:
        return false;
    }
  }

  revealLine(lineNumber: number, column: number = 1, center: boolean = true): void {
    const totalLines = this.buffer.getLineCount();
    const clampedLine = Math.max(1, Math.min(lineNumber, totalLines));
    const lineLen = this.buffer.getLineLength(clampedLine);
    const clampedCol = Math.max(1, Math.min(column, lineLen + 1));

    const lineTop = (clampedLine - 1) * this.viewport.lineHeight;
    let targetScrollTop = lineTop;
    if (center) {
      targetScrollTop = Math.max(0, lineTop - Math.floor(this.viewport.height / 2));
    } else {
      if (lineTop < this.scrollContainer.scrollTop) {
        targetScrollTop = lineTop;
      } else if (lineTop + this.viewport.lineHeight > this.scrollContainer.scrollTop + this.viewport.height) {
        targetScrollTop = lineTop + this.viewport.lineHeight - this.viewport.height;
      } else {
        targetScrollTop = this.scrollContainer.scrollTop;
      }
    }

    this.scrollContainer.scrollTop = targetScrollTop;
    this.viewport.scrollTop = targetScrollTop;

    this.setSelection(new Selection(clampedLine, clampedCol, clampedLine, clampedCol));
    this.render();
  }

  updateOptions(newOptions: Partial<IEditorOptions>): void {
    this.options = { ...this.options, ...newOptions };
    if (newOptions.fontFamily || newOptions.fontSize || newOptions.lineHeight) {
      this.metrics = FontMetrics.measure(
        this.options.fontFamily ?? 'ui-monospace, SFMono-Regular, Menlo, monospace',
        this.options.fontSize ?? 14,
        this.options.lineHeight
      );
      this.viewport.lineHeight = this.metrics.lineHeight;
      this.viewport.charWidth = this.metrics.charWidth;
      this.rootElement.style.fontSize = `${this.metrics.fontSize}px`;
      this.layout();
      this.linesCollection.refresh(this.buffer);
      this.render();
      this.cursor.updatePosition(this.selection.getPosition());
      this.inputController.updatePosition(this.selection.getPosition());
    }
  }

  layout(): void {
    const rect = this.rootElement.getBoundingClientRect();
    const width = rect.width || this.rootElement.clientWidth || 800;
    const height = rect.height || this.rootElement.clientHeight || 600;
    this.viewport.setDimensions(width, height);
    this.updateCanvasHeight();
  }

  private computeMaxLineWidth(): number {
    const totalLines = this.buffer.getLineCount();
    let maxCols = 0;
    const limit = Math.min(totalLines, 500);
    for (let i = 1; i <= limit; i++) {
      const len = this.buffer.getLineLength(i);
      if (len > maxCols) maxCols = len;
    }
    return maxCols * this.viewport.charWidth;
  }

  private updateCanvasHeight(): void {
    const totalLines = this.buffer.getLineCount();
    const totalHeight = this.viewport.getTotalHeight(totalLines);
    this.canvas.style.minHeight = '100%';
    this.canvas.style.height = `${totalHeight}px`;

    const newGutterWidth = this.viewport.computeGutterWidth(totalLines);
    if (newGutterWidth !== this.viewport.gutterWidth) {
      this.viewport.gutterWidth = newGutterWidth;
      this.gutter.container.style.width = `${newGutterWidth}px`;
      this.linesContent.style.left = `${newGutterWidth}px`;
    }

    const totalWidth = Math.max(
      this.viewport.viewportWidth,
      this.viewport.gutterWidth + this.maxLineWidth + 100
    );
    this.canvas.style.minWidth = '100%';
    this.canvas.style.width = `${totalWidth}px`;
  }

  render(): void {
    const totalLines = this.buffer.getLineCount();
    const visible = this.viewport.getVisibleLines(totalLines);

    // Track dynamic max line width from visible lines (mirroring Monaco viewLines._ensureMaxLineWidth)
    let widthChanged = false;
    for (let i = visible.startLineNumber; i <= visible.endLineNumber; i++) {
      const lineWidth = this.buffer.getLineLength(i) * this.viewport.charWidth;
      if (lineWidth > this.maxLineWidth) {
        this.maxLineWidth = lineWidth;
        widthChanged = true;
      }
    }
    if (widthChanged) {
      this.updateCanvasHeight();
    }

    this.linesCollection.update(visible.startLineNumber, visible.endLineNumber, this.buffer);
    this.gutter.update(visible.startLineNumber, visible.endLineNumber, this.selection.positionLineNumber);
    this.selectionOverlay.update(this.selection, this.buffer);
    this.cursor.updatePosition(this.selection.getPosition());
  }

  private bindEvents(): void {
    let startX = 0;
    let startY = 0;
    let isScrolling = false;
    let scrollResetTimer: any = null;

    // Scroll handling (virtualization trigger)
    this.scrollContainer.addEventListener('scroll', () => {
      this.viewport.scrollTop = this.scrollContainer.scrollTop;
      this.viewport.scrollLeft = this.scrollContainer.scrollLeft;
      this.render();
    });

    // Pointer events for click & selection drag
    const getPosFromEvent = (clientX: number, clientY: number): Position => {
      const contentRect = this.linesContent.getBoundingClientRect();
      const x = Math.max(0, clientX - contentRect.left);
      const y = Math.max(0, clientY - contentRect.top);

      const line = this.viewport.getLineNumberAtY(y, this.buffer.getLineCount());
      const lineLen = this.buffer.getLineLength(line);
      const col = this.viewport.getColumnAtX(x, lineLen);
      return new Position(line, col);
    };

    // Touch support (tap vs scroll discrimination matching Monaco)
    this.rootElement.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isScrolling = false;
      }
    }, { passive: true });

    this.rootElement.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);
        if (dx > 8 || dy > 8 || e.touches.length > 1) {
          isScrolling = true;
          this.inputController.blur();
          clearTimeout(scrollResetTimer);
          scrollResetTimer = setTimeout(() => { isScrolling = false; }, 350);
        }
      }
    }, { passive: true });

    this.rootElement.addEventListener('touchend', (e: TouchEvent) => {
      if (isScrolling) {
        clearTimeout(scrollResetTimer);
        scrollResetTimer = setTimeout(() => { isScrolling = false; }, 350);
        return;
      }
      const touch = e.changedTouches && e.changedTouches[0];
      if (touch) {
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);
        if (dx < 8 && dy < 8) {
          const pos = getPosFromEvent(touch.clientX, touch.clientY);
          this.selectionAnchor = pos;
          this.setSelection(new Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column));
          this.inputController.focus();
        }
      }
    });

    // Mouse click & drag
    this.rootElement.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.isPointerDown = true;
      const pos = getPosFromEvent(e.clientX, e.clientY);
      this.selectionAnchor = pos;
      this.setSelection(new Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column));
      this.inputController.focus();
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isPointerDown) return;
      const currentPos = getPosFromEvent(e.clientX, e.clientY);
      this.setSelection(
        new Selection(
          this.selectionAnchor.lineNumber,
          this.selectionAnchor.column,
          currentPos.lineNumber,
          currentPos.column
        )
      );
    });

    window.addEventListener('mouseup', () => {
      this.isPointerDown = false;
    });

    this.rootElement.addEventListener('click', (e: MouseEvent) => {
      this.editStack.pushStackElement();
      const pos = getPosFromEvent(e.clientX, e.clientY);
      this.setSelection(new Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column));
      this.inputController.focus();
    });
  }

  // --- Public Undo / Redo API (Monaco Port) ---
  undo(): boolean {
    const beforeSelection = this.editStack.undo(this.buffer);
    if (!beforeSelection) {
      return false;
    }
    this.setSelection(beforeSelection);
    this.updateCanvasHeight();
    this.refreshLines();
    this.render();
    this.options.onDidChangeContent?.(this.buffer);
    return true;
  }

  redo(): boolean {
    const afterSelection = this.editStack.redo(this.buffer);
    if (!afterSelection) {
      return false;
    }
    this.setSelection(afterSelection);
    this.updateCanvasHeight();
    this.refreshLines();
    this.render();
    this.options.onDidChangeContent?.(this.buffer);
    return true;
  }

  canUndo(): boolean {
    return this.editStack.canUndo();
  }

  canRedo(): boolean {
    return this.editStack.canRedo();
  }

  // --- Input Handlers ---
  private handleType(text: string): void {
    const beforeSelection = this.selection;

    if (!this.selection.isEmpty()) {
      // Monaco Surround Selection Operation: wrap selection with matching pair
      if (text.length === 1) {
        const selectedText = this.buffer.getValueInRange(this.selection);
        const closeChar = AutoClosingPairs.shouldSurround(text, selectedText);
        if (closeChar) {
          const startOffset = this.buffer.getOffsetAt(this.selection.getStartPosition());
          const surrounded = text + selectedText + closeChar;
          this.buffer.applyEdit(this.selection, surrounded);
          const startPos = this.buffer.getPositionAt(startOffset + text.length);
          const endPos = this.buffer.getPositionAt(startOffset + text.length + selectedText.length);
          const newSelection = new Selection(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
          this.setSelection(newSelection);
          this.editStack.pushStackElement();
          this.editStack.pushEdit(beforeSelection, newSelection, new TextChange(startOffset, selectedText, startOffset, surrounded));
          this.editStack.pushStackElement();
          this.updateCanvasHeight();
          this.refreshLines();
          this.render();
          this.options.onDidChangeContent?.(this.buffer);
          return;
        }
      }

      // Replace active selection
      const selectedText = this.buffer.getValueInRange(this.selection);
      const startOffset = this.buffer.getOffsetAt(this.selection.getStartPosition());
      this.buffer.applyEdit(this.selection, text);
      const newPos = this.buffer.getPositionAt(startOffset + text.length);
      const newSelection = new Selection(newPos.lineNumber, newPos.column, newPos.lineNumber, newPos.column);
      this.setSelection(newSelection);
      this.editStack.pushStackElement();
      this.editStack.pushEdit(beforeSelection, newSelection, new TextChange(startOffset, selectedText, startOffset, text));
    } else {
      const pos = this.selection.getPosition();
      const lineContent = this.buffer.getLineContent(pos.lineNumber);
      const charBefore = pos.column > 1 ? lineContent.charAt(pos.column - 2) : '';
      const charAfter = pos.column <= lineContent.length ? lineContent.charAt(pos.column - 1) : '';

      // Monaco Auto Closing Overtype Operation: skip over matching close character
      if (text.length === 1 && AutoClosingPairs.isOvertype(text, charAfter, charBefore)) {
        this.editStack.pushStackElement();
        this.setSelection(new Selection(pos.lineNumber, pos.column + 1, pos.lineNumber, pos.column + 1));
        return;
      }

      // Monaco Auto Closing Open Char Operation: insert open + close and position cursor inside
      if (text.length === 1) {
        const closeChar = AutoClosingPairs.shouldAutoClose(text, charBefore, charAfter);
        if (closeChar) {
          const offset = this.buffer.getOffsetAt(pos);
          const insertText = text + closeChar;
          this.buffer.insert(offset, insertText);
          const newPos = this.buffer.getPositionAt(offset + text.length);
          const newSelection = new Selection(newPos.lineNumber, newPos.column, newPos.lineNumber, newPos.column);
          this.setSelection(newSelection);
          this.editStack.pushEdit(beforeSelection, newSelection, new TextChange(offset, '', offset, insertText));
          this.updateCanvasHeight();
          this.refreshLines();
          this.render();
          this.options.onDidChangeContent?.(this.buffer);
          return;
        }
      }

      // Normal insert
      const offset = this.buffer.getOffsetAt(pos);
      this.buffer.insert(offset, text);
      const newPos = this.buffer.getPositionAt(offset + text.length);
      const newSelection = new Selection(newPos.lineNumber, newPos.column, newPos.lineNumber, newPos.column);
      this.setSelection(newSelection);
      this.editStack.pushEdit(beforeSelection, newSelection, new TextChange(offset, '', offset, text));
    }
    this.updateCanvasHeight();
    this.refreshLines();
    this.render();
    this.options.onDidChangeContent?.(this.buffer);
  }

  private handleDeleteBackward(): void {
    const beforeSelection = this.selection;

    if (!this.selection.isEmpty()) {
      const startOffset = this.buffer.getOffsetAt(this.selection.getStartPosition());
      const selectedText = this.buffer.getValueInRange(this.selection);
      this.buffer.deleteRange(this.selection);
      const newPos = this.buffer.getPositionAt(startOffset);
      const newSelection = new Selection(newPos.lineNumber, newPos.column, newPos.lineNumber, newPos.column);
      this.setSelection(newSelection);
      this.editStack.pushStackElement();
      this.editStack.pushEdit(beforeSelection, newSelection, new TextChange(startOffset, selectedText, startOffset, ''));
    } else {
      const pos = this.selection.getPosition();
      const offset = this.buffer.getOffsetAt(pos);
      if (offset > 0) {
        const lineContent = this.buffer.getLineContent(pos.lineNumber);
        const charBefore = pos.column > 1 ? lineContent.charAt(pos.column - 2) : '';
        const charAfter = pos.column <= lineContent.length ? lineContent.charAt(pos.column - 1) : '';

        // Monaco Auto Closing Pair Delete: delete both brackets when cursor is between them
        if (AutoClosingPairs.shouldAutoDeletePair(charBefore, charAfter)) {
          const deletedText = charBefore + charAfter;
          this.buffer.delete(offset - 1, 2);
          const newPos = this.buffer.getPositionAt(offset - 1);
          const newSelection = new Selection(newPos.lineNumber, newPos.column, newPos.lineNumber, newPos.column);
          this.setSelection(newSelection);
          this.editStack.pushEdit(beforeSelection, newSelection, new TextChange(offset - 1, deletedText, offset - 1, ''));
          this.updateCanvasHeight();
          this.refreshLines();
          this.render();
          this.options.onDidChangeContent?.(this.buffer);
          return;
        }

        const fullText = this.buffer.getText();
        const adjustedOffset = OffsetTransformer.adjustSurrogateOffset(fullText, offset - 1);
        const deleteCount = offset - adjustedOffset;
        const deletedText = fullText.substring(adjustedOffset, offset);

        this.buffer.delete(adjustedOffset, deleteCount);
        const newPos = this.buffer.getPositionAt(adjustedOffset);
        const newSelection = new Selection(newPos.lineNumber, newPos.column, newPos.lineNumber, newPos.column);
        this.setSelection(newSelection);
        this.editStack.pushEdit(beforeSelection, newSelection, new TextChange(adjustedOffset, deletedText, adjustedOffset, ''));
      }
    }
    this.updateCanvasHeight();
    this.refreshLines();
    this.render();
    this.options.onDidChangeContent?.(this.buffer);
  }

  private handleDeleteForward(): void {
    if (!this.selection.isEmpty()) {
      this.handleDeleteBackward();
    } else {
      const beforeSelection = this.selection;
      const offset = this.buffer.getOffsetAt(this.selection.getPosition());
      if (offset < this.buffer.getLength()) {
        const deletedText = this.buffer.getText().substring(offset, offset + 1);
        this.buffer.delete(offset, 1);
        this.editStack.pushEdit(beforeSelection, beforeSelection, new TextChange(offset, deletedText, offset, ''));
      }
    }
    this.updateCanvasHeight();
    this.refreshLines();
    this.render();
    this.options.onDidChangeContent?.(this.buffer);
  }

  private handleEnter(): void {
    this.editStack.pushStackElement();
    this.handleType('\n');
    this.editStack.pushStackElement();
  }

  private handleArrow(direction: 'left' | 'right' | 'up' | 'down', expandSelection: boolean): void {
    this.editStack.pushStackElement();
    const cur = this.selection.getPosition();
    let nextLine = cur.lineNumber;
    let nextCol = cur.column;

    switch (direction) {
      case 'left':
        if (nextCol > 1) {
          nextCol--;
        } else if (nextLine > 1) {
          nextLine--;
          nextCol = this.buffer.getLineLength(nextLine) + 1;
        }
        break;
      case 'right':
        if (nextCol <= this.buffer.getLineLength(nextLine)) {
          nextCol++;
        } else if (nextLine < this.buffer.getLineCount()) {
          nextLine++;
          nextCol = 1;
        }
        break;
      case 'up':
        if (nextLine > 1) {
          nextLine--;
          nextCol = Math.min(nextCol, this.buffer.getLineLength(nextLine) + 1);
        }
        break;
      case 'down':
        if (nextLine < this.buffer.getLineCount()) {
          nextLine++;
          nextCol = Math.min(nextCol, this.buffer.getLineLength(nextLine) + 1);
        }
        break;
    }

    const targetPos = new Position(nextLine, nextCol);
    if (expandSelection) {
      this.setSelection(
        new Selection(
          this.selection.selectionStartLineNumber,
          this.selection.selectionStartColumn,
          targetPos.lineNumber,
          targetPos.column
        )
      );
    } else {
      this.setSelection(new Selection(targetPos.lineNumber, targetPos.column, targetPos.lineNumber, targetPos.column));
    }
  }
}
