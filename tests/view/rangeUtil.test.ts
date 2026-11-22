import { describe, it, expect, beforeEach } from 'vitest';
import { RangeUtil } from '@mythic/view/RangeUtil';
import { EditorView } from '@mythic/view/EditorView';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { Selection } from '@mythic/core/model/Selection';

describe('RangeUtil & VS Code-standard Emoji Sub-pixel Alignment', () => {
  it('gracefully returns null in environments without layout (fallback to CursorColumns)', () => {
    const div = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 })
    } as any;
    const res = RangeUtil.readHorizontalOffset(div, 5);
    expect(res).toBeNull();
  });

  it('measures precise sub-pixel caret offset in rendered DOM element with simulated client rects', () => {
    // Simulate real browser DOM element with emojis: "Hello 😈🔥😂 World"
    const text = 'Hello 😈🔥😂 World';
    // Monospace width: 'Hello ' = 6 * 8.4 = 50.4px
    // Real system emoji font (e.g. Segoe UI Emoji / Apple Color Emoji):
    // 😈 = 19px, 🔥 = 19px, 😂 = 19px (total emojis = 57px)
    // ' World' = 6 * 8.4 = 50.4px
    const textNode = {
      nodeType: 3,
      textContent: text
    };

    const lineEl = {
      nodeType: 1,
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 600, height: 21, right: 700, bottom: 221 }),
      contains: (n: any) => n === textNode
    } as any;

    (globalThis as any).document = {
      createRange: () => {
        let currentOffset = 0;
        return {
          setStart: (_node: any, offset: number) => { currentOffset = offset; },
          setEnd: () => {},
          collapse: () => {},
          getClientRects: () => {
            // Emulate browser sub-pixel text rendering:
            // 0..6 ("Hello ") -> offset * 8.4
            // 6..8 ("😈") -> 50.4 + 19.0 = 69.4
            // 8..10 ("🔥") -> 69.4 + 19.0 = 88.4
            // 10..12 ("😂") -> 88.4 + 19.0 = 107.4
            let pixelOffset = 0;
            if (currentOffset <= 6) {
              pixelOffset = currentOffset * 8.4;
            } else if (currentOffset <= 8) {
              pixelOffset = 50.4 + 19.0;
            } else if (currentOffset <= 10) {
              pixelOffset = 50.4 + 38.0;
            } else if (currentOffset <= 12) {
              pixelOffset = 50.4 + 57.0;
            } else {
              pixelOffset = 50.4 + 57.0 + (currentOffset - 12) * 8.4;
            }
            return [{
              left: 100 + pixelOffset,
              right: 100 + pixelOffset,
              width: 0,
              height: 21,
              top: 200,
              bottom: 221
            }];
          }
        };
      },
      createTreeWalker: () => {
        let yielded = false;
        return {
          nextNode: () => {
            if (!yielded) {
              yielded = true;
              return textNode;
            }
            return null;
          }
        };
      }
    };

    // Before emoji: offset 6 ("Hello ")
    const offsetBeforeEmoji = RangeUtil.readHorizontalOffset(lineEl, 6);
    expect(offsetBeforeEmoji).toBeCloseTo(50.4);

    // After 1st emoji 😈: offset 8
    const offsetAfterFirstEmoji = RangeUtil.readHorizontalOffset(lineEl, 8);
    expect(offsetAfterFirstEmoji).toBeCloseTo(69.4);

    // After 2nd emoji 🔥: offset 10
    const offsetAfterSecondEmoji = RangeUtil.readHorizontalOffset(lineEl, 10);
    expect(offsetAfterSecondEmoji).toBeCloseTo(88.4);

    // After 3rd emoji 😂: offset 12
    const offsetAfterThirdEmoji = RangeUtil.readHorizontalOffset(lineEl, 12);
    expect(offsetAfterThirdEmoji).toBeCloseTo(107.4);
  });
});

describe('Forward and Backward Emoji Deletion without Surrogate Pair Corruption', () => {
  class MockElement {
    className = '';
    style: Record<string, string> = {};
    clientWidth = 800;
    clientHeight = 600;
    scrollTop = 0;
    scrollLeft = 0;
    childNodes: any[] = [];
    parentNode: any = null;
    appendChild(c: any) { this.childNodes.push(c); return c; }
    removeChild(c: any) { return c; }
    replaceChildren() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
    setAttribute() {}
    getAttribute() { return null; }
    addEventListener() {}
    removeEventListener() {}
    focus() {}
    blur() {}
    classList = { add: () => {}, remove: () => {}, contains: () => false };
  }

  beforeEach(() => {
    (globalThis as any).document = {
      createElement: () => new MockElement(),
      createTextNode: (text: string) => ({ textContent: text }),
      createDocumentFragment: () => new MockElement(),
      body: new MockElement()
    };
    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  });

  it('correctly forward-deletes multi-byte emojis (handleDeleteForward)', () => {
    const mount = new MockElement();
    const buffer = new PieceTreeTextBuffer('A😈B', '\n');
    const editor = new EditorView(mount as any, buffer);

    // Position cursor right before 😈: Column 2 (0-based offset 1)
    editor.setSelection(new Selection(1, 2, 1, 2));

    // Press Delete (forward delete)
    editor.handleKey('DELETE');

    // It must delete the ENTIRE surrogate pair (length 2), leaving 'AB'
    expect(buffer.getText()).toBe('AB');
    expect(editor.getSelection().positionColumn).toBe(2);
  });

  it('correctly backward-deletes multi-byte emojis (handleDeleteBackward)', () => {
    const mount = new MockElement();
    const buffer = new PieceTreeTextBuffer('A😈B', '\n');
    const editor = new EditorView(mount as any, buffer);

    // Position cursor right after 😈: Column 4 (0-based offset 3)
    editor.setSelection(new Selection(1, 4, 1, 4));

    // Press Backspace
    editor.handleKey('BACKSPACE');

    // It must delete the ENTIRE surrogate pair (length 2), leaving 'AB'
    expect(buffer.getText()).toBe('AB');
    expect(editor.getSelection().positionColumn).toBe(2);
  });
});
