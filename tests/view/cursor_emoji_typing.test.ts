import { describe, it, expect, beforeEach } from 'vitest';
import { EditorView } from '@mythic/view/EditorView';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';

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

describe('Emoji Typing and Cursor Drift', () => {
  it('tracks cursor position accurately when typing emojis one by one', () => {
    const mount = new MockElement();
    const buffer = new PieceTreeTextBuffer('', '\n');
    const editor = new EditorView(mount as any, buffer);

    console.log('Initial selection:', editor.getSelection());
    console.log('Initial cursor:', (editor as any).cursor.element.style.transform);

    editor.typeText('😈');
    expect(buffer.getText()).toBe('😈');
    expect(editor.getSelection().positionColumn).toBe(3);

    editor.typeText('🔥');
    expect(buffer.getText()).toBe('😈🔥');
    expect(editor.getSelection().positionColumn).toBe(5);

    editor.typeText('😂');
    expect(buffer.getText()).toBe('😈🔥😂');
    expect(editor.getSelection().positionColumn).toBe(7);
  });
});
