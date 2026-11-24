import { describe, it, expect, beforeEach } from 'vitest';
import { ViewBracketMatch } from '@mythic/view/ViewBracketMatch';
import { Viewport } from '@mythic/view/Viewport';
import { EditorView } from '@mythic/view/EditorView';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { Selection } from '@mythic/core/model/Selection';
import { Range } from '@mythic/core/model/Range';

class MockClassList {
  private classes = new Set<string>();
  constructor(initial: string = '') {
    if (initial) {
      initial.split(/\s+/).filter(Boolean).forEach(c => this.classes.add(c));
    }
  }
  add(...tokens: string[]) {
    tokens.forEach(t => this.classes.add(t));
  }
  remove(...tokens: string[]) {
    tokens.forEach(t => this.classes.delete(t));
  }
  contains(token: string) {
    return this.classes.has(token);
  }
}

class MockNode {
  childNodes: MockNode[] = [];
  parentNode: MockNode | null = null;
  textContent: string = '';

  appendChild(child: MockNode): MockNode {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: MockNode): MockNode {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 };
  }

  setAttribute(_name: string, _value: string) {}
  removeAttribute(_name: string) {}
  getAttribute(_name: string) { return null; }
  addEventListener() {}
  removeEventListener() {}
  focus() {}
  blur() {}
}

class MockElement extends MockNode {
  private _className: string = '';
  style: Record<string, string> = {};
  clientWidth = 800;
  clientHeight = 600;
  scrollTop = 0;
  scrollLeft = 0;
  classList = new MockClassList();

  get className(): string {
    return this._className;
  }
  set className(val: string) {
    this._className = val;
    this.classList = new MockClassList(val);
  }
}

class MockDocumentFragment extends MockNode {
  readonly isFragment = true;
}

beforeEach(() => {
  (globalThis as any).document = {
    createElement: (_tag: string) => new MockElement(),
    createTextNode: (text: string) => {
      const node = new MockNode();
      node.textContent = text;
      return node;
    },
    createDocumentFragment: () => new MockDocumentFragment(),
    body: new MockElement()
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
});

describe('ViewBracketMatch Subsystem (Box Outline Highlighting)', () => {
  it('instantiates container with .mythic-bracket-match-layer', () => {
    const viewport = new Viewport(21, 8.4);
    const bracketMatch = new ViewBracketMatch(viewport);

    expect(bracketMatch.container).toBeDefined();
    expect(bracketMatch.container.className).toBe('mythic-bracket-match-layer');
    expect(bracketMatch.getCurrentMatch()).toBeNull();
  });

  it('renders two individual rectangular box outlines for open and close brackets', () => {
    const viewport = new Viewport(21, 8.4);
    const bracketMatch = new ViewBracketMatch(viewport);
    const buffer = new PieceTreeTextBuffer('(hello)', '\n');

    const match = {
      open: new Range(1, 1, 1, 2),
      close: new Range(1, 7, 1, 8)
    };

    bracketMatch.update(match, buffer);

    const openEl = bracketMatch.getOpenElement() as unknown as MockElement;
    const closeEl = bracketMatch.getCloseElement() as unknown as MockElement;

    // Must be two distinct elements wrapping brackets individually
    expect(openEl).not.toBeNull();
    expect(closeEl).not.toBeNull();
    expect(openEl).not.toBe(closeEl);

    // Class name must match .mythic-bracket-match
    expect(openEl.className).toBe('mythic-bracket-match');
    expect(closeEl.className).toBe('mythic-bracket-match');

    // Both must have height matching lineHeight and display: block
    expect(openEl.style.height).toBe('21px');
    expect(closeEl.style.height).toBe('21px');
    expect(openEl.style.display).toBe('block');
    expect(closeEl.style.display).toBe('block');

    // Open element at col 1: left = 0px
    expect(openEl.style.transform).toBe('translate3d(0px, 0px, 0)');
    // Close element at col 7: left = 6 * 8.4 = 50.4px
    expect(closeEl.style.transform).toBe('translate3d(50.4px, 0px, 0)');
    expect(bracketMatch.isMerged()).toBe(false);
  });

  it('merges adjacent brackets into a single unified box outline just like VS Code', () => {
    const viewport = new Viewport(21, 8.4);
    const bracketMatch = new ViewBracketMatch(viewport);
    const buffer = new PieceTreeTextBuffer('()', '\n');

    const match = {
      open: new Range(1, 1, 1, 2),
      close: new Range(1, 2, 1, 3)
    };

    bracketMatch.update(match, buffer);

    expect(bracketMatch.isMerged()).toBe(true);

    const openEl = bracketMatch.getOpenElement() as unknown as MockElement;
    const closeEl = bracketMatch.getCloseElement() as unknown as MockElement;

    // Must be a single unified element wrapping both brackets together
    expect(openEl).not.toBeNull();
    expect(openEl.style.display).toBe('block');
    expect(openEl.className).toBe('mythic-bracket-match');
    expect(openEl.style.transform).toBe('translate3d(0px, 0px, 0)');
    // Total width wraps both characters: 2 * 8.4 = 16.8px
    expect(openEl.style.width).toBe('16.8px');

    // Close element is hidden so there is no double border or middle dividing line
    if (closeEl) {
      expect(closeEl.style.display).toBe('none');
    }
  });

  it('clears and hides outline elements when match is null', () => {
    const viewport = new Viewport(21, 8.4);
    const bracketMatch = new ViewBracketMatch(viewport);
    const buffer = new PieceTreeTextBuffer('(hello)', '\n');

    bracketMatch.update({ open: new Range(1, 1, 1, 2), close: new Range(1, 7, 1, 8) }, buffer);
    expect(bracketMatch.getCurrentMatch()).not.toBeNull();

    bracketMatch.update(null, buffer);
    expect(bracketMatch.getCurrentMatch()).toBeNull();

    const openEl = bracketMatch.getOpenElement() as unknown as MockElement;
    const closeEl = bracketMatch.getCloseElement() as unknown as MockElement;
    expect(openEl.style.display).toBe('none');
    expect(closeEl.style.display).toBe('none');
  });

  it('integrates seamlessly with EditorView cursor movements and jumpToBracket', () => {
    const container = new MockElement() as unknown as HTMLElement;
    const buffer = new PieceTreeTextBuffer('function test() {\n  return 1;\n}', '\n');
    const editor = new EditorView(container, buffer);

    // Cursor at '{' on line 1, col 17
    editor.setSelection(new Selection(1, 17, 1, 17));

    const match = editor.matchBracket();
    expect(match).not.toBeNull();
    expect(match?.open.startLineNumber).toBe(1);
    expect(match?.open.startColumn).toBe(17);
    expect(match?.close.startLineNumber).toBe(3);
    expect(match?.close.startColumn).toBe(1);

    // ViewBracketMatch has open and close elements rendered
    const viewBM = editor.getBracketMatch();
    expect(viewBM.getCurrentMatch()).not.toBeNull();

    // jumpToBracket jumps from open '{' to closing '}'
    const jumped = editor.jumpToBracket();
    expect(jumped).toBe(true);
    expect(editor.getBuffer().getLineContent(editor.matchBracket()!.close.startLineNumber)).toContain('}');

    // Disable bracket matching via setMatchBrackets('never')
    editor.setMatchBrackets('never');
    expect(viewBM.getCurrentMatch()).toBeNull();
  });

  it('highlights enclosing brackets when hitting Enter between () just like VS Code', () => {
    const container = new MockElement() as unknown as HTMLElement;
    const buffer = new PieceTreeTextBuffer('', '\n');
    const editor = new EditorView(container, buffer);

    // Type '()'
    editor.typeText('(');
    // AutoClosingPairs automatically inserts ')' and places cursor between them at col 2
    expect(editor.getBuffer().getText()).toBe('()');
    expect(editor.getSelection().getPosition().column).toBe(2);

    // Press ENTER between '(' and ')'
    editor.handleKey('ENTER');

    // Buffer is split across lines with indentation:
    // Line 1: (
    // Line 2:     
    // Line 3: )
    expect(editor.getBuffer().getLineCount()).toBe(3);
    expect(editor.getBuffer().getLineContent(1)).toBe('(');
    expect(editor.getBuffer().getLineContent(3)).toBe(')');

    // Cursor is on line 2 (inside the block)
    const cursor = editor.getSelection().getPosition();
    expect(cursor.lineNumber).toBe(2);

    // Brackets must STILL be highlighted via findEnclosingBrackets!
    const match = editor.matchBracket();
    expect(match).not.toBeNull();
    expect(match?.open.startLineNumber).toBe(1);
    expect(match?.open.startColumn).toBe(1);
    expect(match?.close.startLineNumber).toBe(3);
    expect(match?.close.startColumn).toBe(1);

    const viewBM = editor.getBracketMatch();
    expect(viewBM.getCurrentMatch()).not.toBeNull();
    expect(viewBM.getOpenElement()?.style.display).toBe('block');
  });
});
