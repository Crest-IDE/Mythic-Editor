import { describe, it, expect } from 'vitest';
import { Selection, SelectionDirection } from '@mythic/core/model/Selection';
import { Range } from '@mythic/core/model/Range';

describe('Selection Model', () => {
  it('correctly reports forward LTR direction', () => {
    // Anchor (1, 1) -> Head (1, 10)
    const selLTR = new Selection(1, 1, 1, 10);
    expect(selLTR.getDirection()).toBe(SelectionDirection.LTR);
    expect(selLTR.startLineNumber).toBe(1);
    expect(selLTR.startColumn).toBe(1);
    expect(selLTR.endLineNumber).toBe(1);
    expect(selLTR.endColumn).toBe(10);
    expect(selLTR.getPosition().column).toBe(10);
    expect(selLTR.getSelectionStart().column).toBe(1);
  });

  it('correctly reports reverse RTL direction', () => {
    // Anchor (2, 10) -> Head (1, 5)
    const selRTL = new Selection(2, 10, 1, 5);
    expect(selRTL.getDirection()).toBe(SelectionDirection.RTL);
    // Range properties must remain normalized
    expect(selRTL.startLineNumber).toBe(1);
    expect(selRTL.startColumn).toBe(5);
    expect(selRTL.endLineNumber).toBe(2);
    expect(selRTL.endColumn).toBe(10);
    // Cursor position is active head
    expect(selRTL.getPosition().lineNumber).toBe(1);
    expect(selRTL.getPosition().column).toBe(5);
    // Selection start is anchor
    expect(selRTL.getSelectionStart().lineNumber).toBe(2);
    expect(selRTL.getSelectionStart().column).toBe(10);
  });

  it('collapses to cursor position', () => {
    const sel = new Selection(3, 1, 1, 4);
    const collapsed = sel.collapseToPosition();
    expect(collapsed.isEmpty()).toBe(true);
    expect(collapsed.selectionStartLineNumber).toBe(1);
    expect(collapsed.selectionStartColumn).toBe(4);
    expect(collapsed.positionLineNumber).toBe(1);
    expect(collapsed.positionColumn).toBe(4);
  });

  it('constructs from Range and Direction', () => {
    const range = new Range(2, 3, 5, 8);
    const ltr = Selection.fromRange(range, SelectionDirection.LTR);
    expect(ltr.selectionStartLineNumber).toBe(2);
    expect(ltr.positionLineNumber).toBe(5);

    const rtl = Selection.fromRange(range, SelectionDirection.RTL);
    expect(rtl.selectionStartLineNumber).toBe(5);
    expect(rtl.positionLineNumber).toBe(2);
  });

  it('tests equality of selections', () => {
    const s1 = new Selection(1, 1, 1, 5);
    const s2 = new Selection(1, 1, 1, 5);
    const s3 = new Selection(1, 5, 1, 1); // same range, opposite direction

    expect(s1.equalsSelection(s2)).toBe(true);
    expect(s1.equalsSelection(s3)).toBe(false);
  });
});
