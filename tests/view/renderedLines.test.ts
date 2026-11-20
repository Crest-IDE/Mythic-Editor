import { describe, it, expect, beforeEach } from 'vitest';
import { Viewport } from '@mythic/view/Viewport';
import { RenderedLinesCollection } from '@mythic/view/RenderedLinesCollection';
import { ViewGutter } from '@mythic/view/ViewGutter';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';

class MockElement {
  style: Record<string, string> = {};
  className: string = '';
  textContent: string = '';
  parentNode: MockElement | null = null;
  children: MockElement[] = [];
  attributes: Record<string, string> = {};

  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
  }
  getAttribute(k: string) {
    return this.attributes[k];
  }

  get classList() {
    return {
      add: (cls: string) => {
        const classes = this.className ? this.className.split(' ') : [];
        if (!classes.includes(cls)) {
          classes.push(cls);
          this.className = classes.join(' ');
        }
      },
      remove: (cls: string) => {
        const classes = this.className ? this.className.split(' ') : [];
        this.className = classes.filter((c) => c !== cls).join(' ');
      },
      contains: (cls: string) => {
        return this.className.split(' ').includes(cls);
      },
    };
  }

  appendChild(child: MockElement) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  insertBefore(child: MockElement, ref: MockElement | null) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    if (!ref) {
      this.children.push(child);
    } else {
      const idx = this.children.indexOf(ref);
      if (idx !== -1) {
        this.children.splice(idx, 0, child);
      } else {
        this.children.push(child);
      }
    }
    return child;
  }
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => new MockElement(),
  };
}

describe('RenderedLinesCollection & ViewGutter Sliding Window (Monaco Port)', () => {
  let container: HTMLDivElement;
  let viewport: Viewport;
  let linesCollection: RenderedLinesCollection;
  let gutter: ViewGutter;
  let buffer: PieceTreeTextBuffer;

  beforeEach(() => {
    container = document.createElement('div');
    viewport = new Viewport(20, 8);
    viewport.setDimensions(800, 600); // 30 lines visible
    linesCollection = new RenderedLinesCollection(container, viewport);
    gutter = new ViewGutter(viewport);

    const lines: string[] = [];
    for (let i = 1; i <= 200; i++) {
      lines.push(`Line number ${i} of code content`);
    }
    buffer = new PieceTreeTextBuffer(lines.join('\n'), '\n');
  });

  it('renders initial viewport lines 1 to 30', () => {
    linesCollection.update(1, 30, buffer);
    gutter.update(1, 30, 1);

    expect(linesCollection.getCount()).toBe(30);
    expect(linesCollection.getStartLineNumber()).toBe(1);
    expect(linesCollection.getEndLineNumber()).toBe(30);
    expect(container.children.length).toBe(30);

    // Verify first line text and position
    const firstLine = container.children[0] as HTMLElement;
    expect(firstLine.textContent).toBe('Line number 1 of code content');
    expect(firstLine.style.top).toBe('0px');

    // Verify gutter
    expect(gutter.getStartLineNumber()).toBe(1);
    expect(gutter.getEndLineNumber()).toBe(30);
    expect(gutter.container.children.length).toBe(30);
    const firstNum = gutter.container.children[0] as HTMLElement;
    expect(firstNum.textContent).toBe('1');
    expect(firstNum.style.top).toBe('0px');
    expect(firstNum.classList.contains('active')).toBe(true);
  });

  it('handles scrolling down with sliding window without destroying untouched lines', () => {
    // Initial 1..30
    linesCollection.update(1, 30, buffer);

    // Scroll down: now visible is 11..40
    linesCollection.update(11, 40, buffer);
    gutter.update(11, 40, 15);

    expect(linesCollection.getCount()).toBe(30);
    expect(linesCollection.getStartLineNumber()).toBe(11);
    expect(linesCollection.getEndLineNumber()).toBe(40);

    // Line 10 was deleted; Line 11 is now first in collection
    const newFirstLine = container.children[0] as HTMLElement;
    expect(newFirstLine.textContent).toBe('Line number 11 of code content');
    expect(newFirstLine.style.top).toBe('200px'); // (11 - 1) * 20 = 200px

    // Gutter sliding window
    expect(gutter.getStartLineNumber()).toBe(11);
    expect(gutter.getEndLineNumber()).toBe(40);
    const newFirstNum = gutter.container.children[0] as HTMLElement;
    expect(newFirstNum.textContent).toBe('11');
    expect(newFirstNum.style.top).toBe('200px'); // 1:1 match with line top!
  });

  it('handles scrolling up with sliding window', () => {
    // Start at 20..50
    linesCollection.update(20, 50, buffer);
    gutter.update(20, 50);

    // Scroll up to 10..40
    linesCollection.update(10, 40, buffer);
    gutter.update(10, 40);

    expect(linesCollection.getStartLineNumber()).toBe(10);
    expect(linesCollection.getEndLineNumber()).toBe(40);
    expect(linesCollection.getCount()).toBe(31);

    expect(gutter.getStartLineNumber()).toBe(10);
    expect(gutter.getEndLineNumber()).toBe(40);

    const firstLine = container.children[0] as HTMLElement;
    expect(firstLine.textContent).toBe('Line number 10 of code content');
    expect(firstLine.style.top).toBe('180px'); // (10 - 1) * 20 = 180px

    const firstNum = gutter.container.children[0] as HTMLElement;
    expect(firstNum.textContent).toBe('10');
    expect(firstNum.style.top).toBe('180px');
  });

  it('handles jump scroll with complete overlap replacement', () => {
    linesCollection.update(1, 30, buffer);
    gutter.update(1, 30);

    // Big jump to 150..180
    linesCollection.update(150, 180, buffer);
    gutter.update(150, 180);

    expect(linesCollection.getStartLineNumber()).toBe(150);
    expect(linesCollection.getEndLineNumber()).toBe(180);
    expect(linesCollection.getCount()).toBe(31);

    expect(gutter.getStartLineNumber()).toBe(150);
    expect(gutter.getEndLineNumber()).toBe(180);

    const firstLine = container.children[0] as HTMLElement;
    expect(firstLine.textContent).toBe('Line number 150 of code content');
    expect(firstLine.style.top).toBe(`${149 * 20}px`);

    const firstNum = gutter.container.children[0] as HTMLElement;
    expect(firstNum.textContent).toBe('150');
    expect(firstNum.style.top).toBe(`${149 * 20}px`);
  });
});
