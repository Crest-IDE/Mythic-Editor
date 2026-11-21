/**
 * Mythic Editor - Undo / Redo Edit Stack
 *
 * Ported directly from Microsoft Monaco Editor (MIT License)
 * Reference: vs/editor/common/model/editStack.ts
 *
 * Manages reversible transactions with consecutive edit compression
 * and cursor state restoration.
 */

import { Selection } from './Selection';
import { TextChange, compressConsecutiveTextChanges } from './TextChange';
import { ITextBuffer } from '../buffer/ITextBuffer';

export class EditStackElement {
  public beforeCursorState: Selection;
  public afterCursorState: Selection;
  public changes: TextChange[];
  private _isOpen: boolean = true;

  constructor(
    beforeCursorState: Selection,
    afterCursorState: Selection,
    changes: TextChange[]
  ) {
    this.beforeCursorState = beforeCursorState;
    this.afterCursorState = afterCursorState;
    this.changes = changes;
  }

  public canAppend(): boolean {
    return this._isOpen;
  }

  public append(textChanges: TextChange[], afterCursorState: Selection): void {
    if (textChanges.length > 0) {
      this.changes = compressConsecutiveTextChanges(this.changes, textChanges);
    }
    this.afterCursorState = afterCursorState;
  }

  public close(): void {
    this._isOpen = false;
  }

  public open(): void {
    this._isOpen = true;
  }
}

export class EditStack {
  private readonly _undoStack: EditStackElement[] = [];
  private readonly _redoStack: EditStackElement[] = [];
  private readonly _maxStackSize: number;

  constructor(maxStackSize: number = 2000) {
    this._maxStackSize = maxStackSize;
  }

  public canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  /**
   * Finalizes the current open transaction (e.g. on navigation, enter, or blur).
   * Reference: vs/editor/common/model/editStack.ts (pushStackElement)
   */
  public pushStackElement(): void {
    if (this._undoStack.length > 0) {
      this._undoStack[this._undoStack.length - 1].close();
    }
  }

  /**
   * Records an edit operation into the stack, compressing consecutive typing if active.
   */
  public pushEdit(
    beforeCursorState: Selection,
    afterCursorState: Selection,
    change: TextChange
  ): void {
    // New edits invalidate the redo branch
    this._redoStack.length = 0;

    const lastElement =
      this._undoStack.length > 0
        ? this._undoStack[this._undoStack.length - 1]
        : null;

    if (lastElement && lastElement.canAppend()) {
      lastElement.append([change], afterCursorState);
    } else {
      const element = new EditStackElement(
        beforeCursorState,
        afterCursorState,
        [change]
      );
      this._undoStack.push(element);

      // Limit stack size
      if (this._undoStack.length > this._maxStackSize) {
        this._undoStack.shift();
      }
    }
  }

  /**
   * Reverts the most recent transaction and restores previous selection.
   * Reference: vs/editor/common/model/editStack.ts (undo)
   */
  public undo(buffer: ITextBuffer): Selection | null {
    this.pushStackElement();

    if (this._undoStack.length === 0) {
      return null;
    }

    const element = this._undoStack.pop()!;

    // Apply inverse edits in reverse order
    for (let i = element.changes.length - 1; i >= 0; i--) {
      const change = element.changes[i];
      if (change.newLength > 0) {
        buffer.delete(change.oldPosition, change.newLength);
      }
      if (change.oldLength > 0) {
        buffer.insert(change.oldPosition, change.oldText);
      }
    }

    element.close();
    this._redoStack.push(element);

    return element.beforeCursorState;
  }

  /**
   * Reapplies the most recent undone transaction and restores resulting selection.
   * Reference: vs/editor/common/model/editStack.ts (redo)
   */
  public redo(buffer: ITextBuffer): Selection | null {
    if (this._redoStack.length === 0) {
      return null;
    }

    const element = this._redoStack.pop()!;

    // Apply forward edits
    for (let i = 0; i < element.changes.length; i++) {
      const change = element.changes[i];
      if (change.oldLength > 0) {
        buffer.delete(change.oldPosition, change.oldLength);
      }
      if (change.newLength > 0) {
        buffer.insert(change.oldPosition, change.newText);
      }
    }

    element.close();
    this._undoStack.push(element);

    return element.afterCursorState;
  }

  /**
   * Clear all undo and redo history.
   */
  public clear(): void {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
  }
}
