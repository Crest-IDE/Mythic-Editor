import { describe, it, expect, beforeEach } from 'vitest';
import {
  RenderedLinesCollection,
  ILineToken,
  ILineTokensProvider
} from '@mythic/view/RenderedLinesCollection';
import { Viewport } from '@mythic/view/Viewport';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';

// Minimal DOM mock for Node environment
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
}

class MockElement extends MockNode {
  className: string = '';
  style: Record<string, string> = {};
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
    createDocumentFragment: () => new MockDocumentFragment()
  };
});

describe('RenderedLinesCollection - Tree-sitter & Syntax Highlighting', () => {
  const viewport = new Viewport(20, 8);

  it('renders plain text when no tokens provider is attached', () => {
    const container = new MockElement();
    const collection = new RenderedLinesCollection(container as any, viewport);
    const buffer = new PieceTreeTextBuffer('hello world', '\n');

    collection.update(1, 1, buffer);

    expect(container.childNodes.length).toBe(1);
    const lineEl = container.childNodes[0] as MockElement;
    expect(lineEl.className).toBe('mythic-view-line');
    expect(lineEl.textContent).toBe('hello world');
  });

  it('slices line into syntax spans when tokens provider is present', () => {
    const container = new MockElement();
    const mockTokens: Record<number, ILineToken[]> = {
      1: [
        { startIndex: 0, endIndex: 5, type: 'keyword' }, // "const"
        { startIndex: 6, endIndex: 7, type: 'variable' }, // "x"
        { startIndex: 10, endIndex: 12, type: 'number' } // "42"
      ]
    };

    const tokenProvider: ILineTokensProvider = {
      getLineTokens: (line: number) => mockTokens[line]
    };

    const collection = new RenderedLinesCollection(container as any, viewport, tokenProvider);
    const buffer = new PieceTreeTextBuffer('const x = 42;', '\n');

    collection.update(1, 1, buffer);

    const lineEl = container.childNodes[0] as MockElement;
    // Children should be:
    // 1. span.mtk-keyword ("const")
    // 2. textNode (" ")
    // 3. span.mtk-variable ("x")
    // 4. textNode (" = ")
    // 5. span.mtk-number ("42")
    // 6. textNode (";")
    expect(lineEl.childNodes.length).toBe(6);

    const span1 = lineEl.childNodes[0] as MockElement;
    expect(span1.className).toContain('mtk-keyword');
    expect(span1.textContent).toBe('const');

    const gap1 = lineEl.childNodes[1];
    expect(gap1.textContent).toBe(' ');

    const span2 = lineEl.childNodes[2] as MockElement;
    expect(span2.className).toContain('mtk-variable');
    expect(span2.textContent).toBe('x');

    const gap2 = lineEl.childNodes[3];
    expect(gap2.textContent).toBe(' = ');

    const span3 = lineEl.childNodes[4] as MockElement;
    expect(span3.className).toContain('mtk-number');
    expect(span3.textContent).toBe('42');

    const gap3 = lineEl.childNodes[5];
    expect(gap3.textContent).toBe(';');
  });

  it('updates token highlighting dynamically on refreshLine', () => {
    const container = new MockElement();
    const collection = new RenderedLinesCollection(container as any, viewport);
    const buffer = new PieceTreeTextBuffer('let name = "mythic";', '\n');

    // First render: unhighlighted
    collection.update(1, 1, buffer);
    let lineEl = container.childNodes[0] as MockElement;
    expect(lineEl.textContent).toBe('let name = "mythic";');

    // Asynchronously Tree-sitter finishes parsing:
    const provider: ILineTokensProvider = {
      getLineTokens: () => [
        { startIndex: 0, endIndex: 3, type: 'keyword' },
        { startIndex: 11, endIndex: 19, type: 'string' }
      ]
    };

    collection.setTokensProvider(provider);
    collection.refreshLine(1, buffer);

    expect(lineEl.childNodes.length).toBe(4);
    expect((lineEl.childNodes[0] as MockElement).className).toContain('mtk-keyword');
    expect((lineEl.childNodes[0] as MockElement).textContent).toBe('let');
    expect(lineEl.childNodes[1].textContent).toBe(' name = ');
    expect((lineEl.childNodes[2] as MockElement).className).toContain('mtk-string');
    expect((lineEl.childNodes[2] as MockElement).textContent).toBe('"mythic"');
    expect(lineEl.childNodes[3].textContent).toBe(';');
  });

  it('handles empty lines gracefully with non-breaking space', () => {
    const container = new MockElement();
    const collection = new RenderedLinesCollection(container as any, viewport);
    const buffer = new PieceTreeTextBuffer('', '\n');

    collection.update(1, 1, buffer);
    const lineEl = container.childNodes[0] as MockElement;
    expect(lineEl.textContent).toBe('\u00a0');
  });
});
