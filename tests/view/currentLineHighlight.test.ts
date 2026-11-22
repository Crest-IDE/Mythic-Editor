import { describe, it, expect, beforeEach } from 'vitest';
import { ViewCurrentLineHighlight } from '@mythic/view/ViewCurrentLineHighlight';
import { Viewport } from '@mythic/view/Viewport';
import { EditorView } from '@mythic/view/EditorView';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { Selection } from '@mythic/core/model/Selection';

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

  replaceChildren(...newChildren: MockNode[]): void {
    for (const c of this.childNodes) {
      c.parentNode = null;
    }
    this.childNodes = [];
    for (const c of newChildren) {
      c.parentNode = this;
      this.childNodes.push(c);
    }
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

describe('ViewCurrentLineHighlight Subsystem', () => {
  it('instantiates correctly with default mode and dimensions', () => {
    const viewport = new Viewport(21, 8.4);
    const highlight = new ViewCurrentLineHighlight(viewport, 'all');

    expect(highlight.element).toBeDefined();
    expect(highlight.element.className).toBe('mythic-current-line-highlight');
    expect(highlight.element.style.height).toBe('21px');
    expect(highlight.element.style.top).toBe('0px');
    expect(highlight.element.style.display).toBe('none');
    expect(highlight.getMode()).toBe('all');
    expect(highlight.getIsVisible()).toBe(false);
  });

  it('updates position and visibility on active line with empty selection', () => {
    const viewport = new Viewport(21, 8.4);
    const highlight = new ViewCurrentLineHighlight(viewport, 'all');

    // Line 1
    highlight.update(1, true, true);
    expect(highlight.getIsVisible()).toBe(true);
    expect(highlight.element.style.display).toBe('block');
    expect(highlight.element.style.transform).toBe('translate3d(0, 0px, 0)');
    expect(highlight.element.classList.contains('inactive')).toBe(false);

    // Line 4 (top = (4-1)*21 = 63px)
    highlight.update(4, true, true);
    expect(highlight.getIsVisible()).toBe(true);
    expect(highlight.element.style.transform).toBe('translate3d(0, 63px, 0)');
  });

  it('hides line highlight overlay when selection is non-empty', () => {
    const viewport = new Viewport(21, 8.4);
    const highlight = new ViewCurrentLineHighlight(viewport, 'all');

    highlight.update(1, true, true);
    expect(highlight.getIsVisible()).toBe(true);
    expect(highlight.element.style.display).toBe('block');

    // Non-empty selection (selectionIsEmpty = false)
    highlight.update(1, false, true);
    expect(highlight.getIsVisible()).toBe(false);
    expect(highlight.element.style.display).toBe('none');

    // Collapsing selection restores visibility
    highlight.update(1, true, true);
    expect(highlight.getIsVisible()).toBe(true);
    expect(highlight.element.style.display).toBe('block');
  });

  it('adds inactive class when editor loses focus', () => {
    const viewport = new Viewport(21, 8.4);
    const highlight = new ViewCurrentLineHighlight(viewport, 'all');

    highlight.update(1, true, false);
    expect(highlight.element.classList.contains('inactive')).toBe(true);

    highlight.update(1, true, true);
    expect(highlight.element.classList.contains('inactive')).toBe(false);
  });

  it('respects renderLineHighlight mode options', () => {
    const viewport = new Viewport(21, 8.4);
    const highlight = new ViewCurrentLineHighlight(viewport, 'all');

    // Mode 'line': content highlight should show
    highlight.setMode('line');
    highlight.update(1, true, true);
    expect(highlight.getIsVisible()).toBe(true);
    expect(highlight.element.style.display).toBe('block');

    // Mode 'gutter': content highlight should NOT show
    highlight.setMode('gutter');
    highlight.update(1, true, true);
    expect(highlight.getIsVisible()).toBe(false);
    expect(highlight.element.style.display).toBe('none');

    // Mode 'none': content highlight should NOT show
    highlight.setMode('none');
    highlight.update(1, true, true);
    expect(highlight.getIsVisible()).toBe(false);
    expect(highlight.element.style.display).toBe('none');

    // Mode 'all': content highlight should show
    highlight.setMode('all');
    highlight.update(1, true, true);
    expect(highlight.getIsVisible()).toBe(true);
    expect(highlight.element.style.display).toBe('block');
  });

  it('updates target width according to document max line width', () => {
    const viewport = new Viewport(21, 8.4);
    viewport.setDimensions(800, 600);
    const highlight = new ViewCurrentLineHighlight(viewport, 'all');

    highlight.updateWidth(1500);
    expect(highlight.element.style.width).toBe('1500px');

    highlight.updateWidth(400); // smaller than viewport width (800)
    expect(highlight.element.style.width).toBe('800px');
  });
});

describe('EditorView Current Line Highlight Integration', () => {
  it('highlights initial line on editor mount', () => {
    const container = new MockElement();
    const buffer = new PieceTreeTextBuffer('first line\nsecond line\nthird line', '\n');
    const editor = new EditorView(container as any, buffer, { renderLineHighlight: 'all' });

    const highlight = editor.getLineHighlight();
    expect(highlight.getIsVisible()).toBe(true);
    expect(highlight.getCurrentLine()).toBe(1);
    expect(highlight.element.style.transform).toBe('translate3d(0, 0px, 0)');
  });

  it('tracks cursor movement across lines and moves highlight', () => {
    const container = new MockElement();
    const buffer = new PieceTreeTextBuffer('line 1\nline 2\nline 3\nline 4', '\n');
    const editor = new EditorView(container as any, buffer);

    const highlight = editor.getLineHighlight();
    expect(highlight.getCurrentLine()).toBe(1);

    // Arrow down to line 2
    editor.handleKey('DOWN');
    expect(highlight.getCurrentLine()).toBe(2);
    expect(highlight.element.style.transform).toBe('translate3d(0, 21px, 0)');

    // Arrow down to line 3
    editor.handleKey('DOWN');
    expect(highlight.getCurrentLine()).toBe(3);
    expect(highlight.element.style.transform).toBe('translate3d(0, 42px, 0)');

    // Arrow up back to line 2
    editor.handleKey('UP');
    expect(highlight.getCurrentLine()).toBe(2);
    expect(highlight.element.style.transform).toBe('translate3d(0, 21px, 0)');
  });

  it('hides content highlight when range selection is created and restores on collapse', () => {
    const container = new MockElement();
    const buffer = new PieceTreeTextBuffer('hello world\nsecond line', '\n');
    const editor = new EditorView(container as any, buffer);

    const highlight = editor.getLineHighlight();
    expect(highlight.getIsVisible()).toBe(true);

    // Create selection: line 1, col 1 to line 1, col 6
    editor.setSelection(new Selection(1, 1, 1, 6));
    expect(highlight.getIsVisible()).toBe(false);
    expect(highlight.element.style.display).toBe('none');

    // Collapse selection
    editor.setSelection(new Selection(1, 6, 1, 6));
    expect(highlight.getIsVisible()).toBe(true);
    expect(highlight.element.style.display).toBe('block');
  });

  it('dynamically switches renderLineHighlight mode', () => {
    const container = new MockElement();
    const buffer = new PieceTreeTextBuffer('first\nsecond', '\n');
    const editor = new EditorView(container as any, buffer, { renderLineHighlight: 'all' });

    expect(editor.getRenderLineHighlight()).toBe('all');
    expect(editor.getLineHighlight().getIsVisible()).toBe(true);

    // Switch to 'gutter' only: content highlight hides
    editor.setRenderLineHighlight('gutter');
    expect(editor.getRenderLineHighlight()).toBe('gutter');
    expect(editor.getLineHighlight().getIsVisible()).toBe(false);

    // Switch to 'line' only: content highlight shows
    editor.setRenderLineHighlight('line');
    expect(editor.getRenderLineHighlight()).toBe('line');
    expect(editor.getLineHighlight().getIsVisible()).toBe(true);

    // Switch to 'none': content highlight hides
    editor.setRenderLineHighlight('none');
    expect(editor.getRenderLineHighlight()).toBe('none');
    expect(editor.getLineHighlight().getIsVisible()).toBe(false);

    // Update via updateOptions
    editor.updateOptions({ renderLineHighlight: 'all' });
    expect(editor.getRenderLineHighlight()).toBe('all');
    expect(editor.getLineHighlight().getIsVisible()).toBe(true);
  });

  it('updates focus and blur inactive states', () => {
    const container = new MockElement();
    const buffer = new PieceTreeTextBuffer('test focus\nline 2', '\n');
    const editor = new EditorView(container as any, buffer);

    editor.blur();
    expect(editor.getLineHighlight().element.classList.contains('inactive')).toBe(true);

    editor.focus();
    expect(editor.getLineHighlight().element.classList.contains('inactive')).toBe(false);
  });
});
