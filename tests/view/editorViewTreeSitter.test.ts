import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { EditorView } from '@mythic/view/EditorView';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { TreeSitterHighlighter } from '@mythic/syntax/TreeSitterHighlighter';

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
      if ((c as any).isFragment) {
        for (const fc of c.childNodes) {
          fc.parentNode = this;
          this.childNodes.push(fc);
        }
      } else {
        c.parentNode = this;
        this.childNodes.push(c);
      }
    }
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 };
  }

  setAttribute(_name: string, _value: string) {}
  getAttribute(_name: string) { return null; }
  addEventListener() {}
  removeEventListener() {}
  focus() {}
  blur() {}
}

class MockElement extends MockNode {
  className: string = '';
  style: Record<string, string> = {};
  clientWidth = 800;
  clientHeight = 600;
  scrollTop = 0;
  scrollLeft = 0;
  classList = {
    add: () => {},
    remove: () => {},
    contains: () => false
  };
}

class MockDocumentFragment extends MockNode {
  readonly isFragment = true;
}

beforeAll(async () => {
  await TreeSitterHighlighter.init();
  await TreeSitterHighlighter.loadLanguage('javascript');
  await TreeSitterHighlighter.loadLanguage('python');
});

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

describe('EditorView with Tree-sitter Integration', () => {
  it('automatically highlights buffer when language is configured', () => {
    const mount = new MockElement();
    const code = 'function calculateSum(a, b) {\n  return a + b;\n}';
    const buffer = new PieceTreeTextBuffer(code, '\n');

    const highlighter = new TreeSitterHighlighter('javascript');
    const editor = new EditorView(mount as any, buffer, {
      tokensProvider: highlighter
    });

    const provider = editor.getTokensProvider();
    expect(provider).toBeInstanceOf(TreeSitterHighlighter);

    const line1Tokens = provider!.getLineTokens(1);
    expect(line1Tokens).toBeDefined();
    expect(line1Tokens!.some(t => t.type === 'keyword')).toBe(true);
    expect(line1Tokens!.some(t => t.type === 'function')).toBe(true);
  });

  it('switches languages dynamically using setLanguage()', () => {
    const mount = new MockElement();
    const code = 'def add(a, b):\n    return a + b';
    const buffer = new PieceTreeTextBuffer(code, '\n');

    const highlighter = new TreeSitterHighlighter('javascript');
    const editor = new EditorView(mount as any, buffer, {
      tokensProvider: highlighter
    });

    editor.setLanguage('python');
    const provider = editor.getTokensProvider();
    expect(provider).toBeInstanceOf(TreeSitterHighlighter);
    expect((provider as TreeSitterHighlighter).getLanguage()).toBe('python');

    const line1Tokens = provider!.getLineTokens(1);
    expect(line1Tokens).toBeDefined();
    expect(line1Tokens!.some(t => t.type === 'keyword')).toBe(true);
  });

  it('updates syntax highlighting tokens immediately while typing live code (e.g. print(""))', () => {
    const mount = new MockElement();
    const buffer = new PieceTreeTextBuffer('', '\n');

    const highlighter = new TreeSitterHighlighter('python');
    const editor = new EditorView(mount as any, buffer, {
      tokensProvider: highlighter
    });

    // Type 'print("hello")' character by character
    const code = 'print("hello")';
    for (const ch of code) {
      editor.typeText(ch);
    }

    const provider = editor.getTokensProvider();
    expect(provider).toBeInstanceOf(TreeSitterHighlighter);

    const line1Tokens = provider!.getLineTokens(1);
    expect(line1Tokens).toBeDefined();
    expect(line1Tokens!.length).toBeGreaterThan(0);
    // Should capture 'print' as function or variable and '"hello"' as string
    expect(line1Tokens!.some(t => t.type === 'function' || t.type === 'variable')).toBe(true);
    expect(line1Tokens!.some(t => t.type === 'string')).toBe(true);
  });
});
