import { describe, it, expect } from 'vitest';
import { TextChange, compressConsecutiveTextChanges } from '@mythic/core/model/TextChange';
import { EditStack } from '@mythic/core/model/EditStack';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { Selection } from '@mythic/core/model/Selection';

describe('TextChange and Change Compression (Monaco Port)', () => {
  it('correctly calculates change dimensions', () => {
    const change = new TextChange(5, 'foo', 5, 'barbaz');
    expect(change.oldPosition).toBe(5);
    expect(change.oldLength).toBe(3);
    expect(change.oldEnd).toBe(8);
    expect(change.newPosition).toBe(5);
    expect(change.newLength).toBe(6);
    expect(change.newEnd).toBe(11);
  });

  it('compresses consecutive typing into a single combined change', () => {
    // Typing 'a', then 'b', then 'c' at offset 0
    const edit1 = new TextChange(0, '', 0, 'a');
    const edit2 = new TextChange(1, '', 1, 'b');
    const edit3 = new TextChange(2, '', 2, 'c');

    let combined = compressConsecutiveTextChanges([edit1], [edit2]);
    expect(combined.length).toBe(1);
    expect(combined[0].oldPosition).toBe(0);
    expect(combined[0].oldText).toBe('');
    expect(combined[0].newText).toBe('ab');

    combined = compressConsecutiveTextChanges(combined, [edit3]);
    expect(combined.length).toBe(1);
    expect(combined[0].oldPosition).toBe(0);
    expect(combined[0].oldText).toBe('');
    expect(combined[0].newText).toBe('abc');
  });

  it('compresses typing followed by backspace', () => {
    // Typed 'abc' -> offset 0 to 3
    const edit1 = new TextChange(0, '', 0, 'abc');
    // Deleted last char 'c' at offset 2
    const edit2 = new TextChange(2, 'c', 2, '');

    const combined = compressConsecutiveTextChanges([edit1], [edit2]);
    expect(combined.length).toBe(1);
    expect(combined[0].oldPosition).toBe(0);
    expect(combined[0].oldText).toBe('');
    expect(combined[0].newText).toBe('ab');
  });
});

describe('EditStack Undo / Redo Transactions (Monaco Port)', () => {
  it('handles basic typing and single undo/redo', () => {
    const buffer = new PieceTreeTextBuffer('', '\n');
    const stack = new EditStack();

    const sel0 = new Selection(1, 1, 1, 1);
    const sel1 = new Selection(1, 6, 1, 6);

    // Type "hello"
    buffer.insert(0, 'hello');
    stack.pushEdit(sel0, sel1, new TextChange(0, '', 0, 'hello'));

    expect(buffer.getText()).toBe('hello');
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);

    // Undo -> buffer should be empty, selection should be sel0
    const restoredSel = stack.undo(buffer);
    expect(buffer.getText()).toBe('');
    expect(restoredSel?.equalsRange(sel0)).toBe(true);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(true);

    // Redo -> buffer should be "hello", selection should be sel1
    const redoneSel = stack.redo(buffer);
    expect(buffer.getText()).toBe('hello');
    expect(redoneSel?.equalsRange(sel1)).toBe(true);
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);
  });

  it('handles multi-step transactions separated by pushStackElement', () => {
    const buffer = new PieceTreeTextBuffer('', '\n');
    const stack = new EditStack();

    // Step 1: Type "hello"
    buffer.insert(0, 'hello');
    stack.pushEdit(
      new Selection(1, 1, 1, 1),
      new Selection(1, 6, 1, 6),
      new TextChange(0, '', 0, 'hello')
    );
    stack.pushStackElement(); // Finalize step 1

    // Step 2: Type " world"
    buffer.insert(5, ' world');
    stack.pushEdit(
      new Selection(1, 6, 1, 6),
      new Selection(1, 12, 1, 12),
      new TextChange(5, '', 5, ' world')
    );
    stack.pushStackElement(); // Finalize step 2

    expect(buffer.getText()).toBe('hello world');

    // Undo step 2
    stack.undo(buffer);
    expect(buffer.getText()).toBe('hello');

    // Undo step 1
    stack.undo(buffer);
    expect(buffer.getText()).toBe('');

    // Redo step 1
    stack.redo(buffer);
    expect(buffer.getText()).toBe('hello');

    // Redo step 2
    stack.redo(buffer);
    expect(buffer.getText()).toBe('hello world');
  });

  it('invalidates redo stack on new typing after undo', () => {
    const buffer = new PieceTreeTextBuffer('', '\n');
    const stack = new EditStack();

    buffer.insert(0, 'hello');
    stack.pushEdit(
      new Selection(1, 1, 1, 1),
      new Selection(1, 6, 1, 6),
      new TextChange(0, '', 0, 'hello')
    );
    stack.pushStackElement();

    // Undo
    stack.undo(buffer);
    expect(buffer.getText()).toBe('');
    expect(stack.canRedo()).toBe(true);

    // Type something new -> branch diverged
    buffer.insert(0, 'mythic');
    stack.pushEdit(
      new Selection(1, 1, 1, 1),
      new Selection(1, 7, 1, 7),
      new TextChange(0, '', 0, 'mythic')
    );

    // Redo should now be cleared
    expect(stack.canRedo()).toBe(false);
    expect(buffer.getText()).toBe('mythic');
  });

  it('handles replacing selection and undoing replacement', () => {
    const buffer = new PieceTreeTextBuffer('foo test bar', '\n');
    const stack = new EditStack();

    const beforeSel = new Selection(1, 5, 1, 9); // "test"
    const afterSel = new Selection(1, 5, 1, 15);  // "mythic"

    // Replace "test" with "mythic"
    buffer.delete(4, 4);
    buffer.insert(4, 'mythic');
    stack.pushEdit(
      beforeSel,
      afterSel,
      new TextChange(4, 'test', 4, 'mythic')
    );

    expect(buffer.getText()).toBe('foo mythic bar');

    // Undo
    const restored = stack.undo(buffer);
    expect(buffer.getText()).toBe('foo test bar');
    expect(restored?.equalsRange(beforeSel)).toBe(true);

    // Redo
    const redone = stack.redo(buffer);
    expect(buffer.getText()).toBe('foo mythic bar');
    expect(redone?.equalsRange(afterSel)).toBe(true);
  });
});
