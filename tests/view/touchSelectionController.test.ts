import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PieceTreeTextBuffer } from '../../src/core/buffer/PieceTreeTextBuffer';
import { EditorView } from '../../src/view/EditorView';
import { Selection } from '../../src/core/model/Selection';
import { Position } from '../../src/core/model/Position';

class MockClassList {
  private classes = new Set<string>();
  constructor(initial: string = '') {
    if (initial) {
      initial.split(/\s+/).filter(Boolean).forEach((c) => this.classes.add(c));
    }
  }
  add(...tokens: string[]) {
    tokens.forEach((t) => this.classes.add(t));
  }
  remove(...tokens: string[]) {
    tokens.forEach((t) => this.classes.delete(t));
  }
  contains(token: string) {
    return this.classes.has(token);
  }
  toggle(token: string, force?: boolean) {
    if (force === true) {
      this.classes.add(token);
      return true;
    } else if (force === false) {
      this.classes.delete(token);
      return false;
    }
    if (this.classes.has(token)) {
      this.classes.delete(token);
      return false;
    }
    this.classes.add(token);
    return true;
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
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
  }

  listeners: Record<string, ((e: any) => void)[]> = {};
  setAttribute(_name: string, _value: string) {}
  removeAttribute(_name: string) {}
  getAttribute(_name: string) {
    return null;
  }
  addEventListener(evt: string, cb: (e: any) => void) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(cb);
  }
  removeEventListener() {}
  dispatchEvent(event: { type: string; stopPropagation?: () => void }) {
    const list = this.listeners[event.type];
    if (list) {
      for (const cb of list) cb(event);
    }
  }
  click() {
    this.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  }
  focus() {}
  blur() {}
}

class MockElement extends MockNode {
  private _className: string = '';
  style: Record<string, string> = {};
  classList = new MockClassList();
  id: string = '';

  get className(): string {
    return this._className;
  }

  set className(val: string) {
    this._className = val;
    this.classList = new MockClassList(val);
  }

  closest(_selector: string): any {
    return null;
  }
}

beforeEach(() => {
  (globalThis as any).document = {
    createElement: (_tag: string) => new MockElement(),
    createTextNode: (text: string) => {
      const node = new MockNode();
      node.textContent = text;
      return node;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    body: new MockElement()
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
});

describe('TouchSelectionController Subsystem', () => {
  let container: any;
  let buffer: PieceTreeTextBuffer;
  let editor: EditorView;

  beforeEach(() => {
    container = new MockElement();
    buffer = new PieceTreeTextBuffer('function helloWorld() {\n  const message = "Hello Mythic";\n  return message;\n}');
    editor = new EditorView(container, buffer);
  });

  afterEach(() => {
    editor.touchSelectionController.dispose();
  });

  it('instantiates teardrop handles and floating toolbar in the root element', () => {
    const controller = editor.touchSelectionController;
    expect(controller.startHandle).toBeDefined();
    expect(controller.endHandle).toBeDefined();
    expect(controller.floatingToolbar).toBeDefined();

    expect(controller.startHandle.classList.contains('selection-handle')).toBe(true);
    expect(controller.startHandle.classList.contains('handle-start')).toBe(true);

    expect(controller.endHandle.classList.contains('selection-handle')).toBe(true);
    expect(controller.endHandle.classList.contains('handle-end')).toBe(true);

    expect(controller.floatingToolbar.id).toBe('floating-toolbar');
    expect(controller.floatingToolbar.classList.contains('mythic-floating-toolbar')).toBe(true);

    expect(controller.floatingCut.textContent).toBe('Cut');
    expect(controller.floatingCopy.textContent).toBe('Copy');
    expect(controller.floatingPaste.textContent).toBe('Paste');
    expect(controller.floatingSelectAll.textContent).toBe('Select All');
  });

  it('correctly extracts words at position using getWordAtPosition', () => {
    // Line 1: function helloWorld() {
    const word1 = editor.getWordAtPosition(new Position(1, 12));
    expect(word1).not.toBeNull();
    expect(word1?.word).toBe('helloWorld');
    expect(word1?.startColumn).toBe(10);
    expect(word1?.endColumn).toBe(20);

    // Line 2:   const message = "Hello Mythic";
    const word2 = editor.getWordAtPosition(new Position(2, 5));
    expect(word2).not.toBeNull();
    expect(word2?.word).toBe('const');

    // On punctuation or whitespace with no adjacent word
    const emptyWord = editor.getWordAtPosition(new Position(1, 23));
    expect(emptyWord?.word).toBeUndefined();
  });

  it('updates handle and toolbar visibility when selection changes', () => {
    const controller = editor.touchSelectionController;

    // Initially collapsed selection -> handles hidden
    controller.updateUiNow();
    expect(controller.startHandle.classList.contains('visible')).toBe(false);
    expect(controller.endHandle.classList.contains('visible')).toBe(false);

    // Set non-empty selection
    editor.setSelection(new Selection(1, 10, 1, 20));
    controller.updateUiNow();

    expect(controller.startHandle.classList.contains('visible')).toBe(true);
    expect(controller.endHandle.classList.contains('visible')).toBe(true);
    expect(controller.floatingToolbar.classList.contains('visible')).toBe(true);

    // Collapse selection again
    editor.setSelection(new Selection(1, 10, 1, 10));
    controller.updateUiNow();

    expect(controller.startHandle.classList.contains('visible')).toBe(false);
    expect(controller.endHandle.classList.contains('visible')).toBe(false);
  });

  it('handles Select All action smoothly', () => {
    editor.selectAll();

    const sel = editor.getSelection();
    expect(sel.startLineNumber).toBe(1);
    expect(sel.startColumn).toBe(1);
    expect(sel.endLineNumber).toBe(buffer.getLineCount());
    expect(editor.getSelectedText()).toBe(buffer.getText());
  });

  it('triggers selectAll when clicking the floatingSelectAll button', () => {
    const controller = editor.touchSelectionController;
    (controller.floatingSelectAll as any).click();

    const sel = editor.getSelection();
    expect(sel.startLineNumber).toBe(1);
    expect(sel.startColumn).toBe(1);
    expect(sel.endLineNumber).toBe(buffer.getLineCount());
    expect(editor.getSelectedText()).toBe(buffer.getText());
  });

  it('handles Cut and Copy actions', async () => {
    editor.setSelection(new Selection(1, 1, 1, 9)); // 'function'
    expect(editor.getSelectedText()).toBe('function');

    // Simulate Cut
    editor.handleDeleteBackward();
    expect(buffer.getLineContent(1)).toBe(' helloWorld() {');
  });

  it('disposes elements cleanly on dispose()', () => {
    const controller = editor.touchSelectionController;
    controller.dispose();

    expect(controller.startHandle.parentNode).toBeNull();
    expect(controller.endHandle.parentNode).toBeNull();
    expect(controller.floatingToolbar.parentNode).toBeNull();
  });
});
