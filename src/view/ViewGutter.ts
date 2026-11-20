/**
 * Mythic Editor - View Gutter (Line Numbers)
 *
 * Ported directly from Microsoft Monaco Editor (MIT License)
 * Reference: vs/editor/browser/viewParts/lineNumbers/lineNumbers.ts
 *
 * Virtualized line numbers gutter synchronized with the main line view using
 * Monaco's sliding window algorithm.
 */

import { Viewport } from './Viewport';

export class ViewGutter {
  readonly container: HTMLElement;
  private readonly viewport: Viewport;
  private numbers: HTMLElement[] = [];
  private rendLineNumberStart: number = 1;

  constructor(viewport: Viewport) {
    this.viewport = viewport;
    this.container = document.createElement('div');
    this.container.className = 'mythic-gutter';
    this.container.style.width = `${viewport.gutterWidth}px`;
  }

  getStartLineNumber(): number {
    return this.rendLineNumberStart;
  }

  getEndLineNumber(): number {
    return this.rendLineNumberStart + this.numbers.length - 1;
  }

  update(startLineNumber: number, endLineNumber: number, activeLineNumber?: number): void {
    const oldStart = this.rendLineNumberStart;
    const oldLength = this.numbers.length;
    const oldEnd = oldStart + oldLength - 1;

    // Case 1: No line numbers currently, or zero overlap (jump scroll)
    if (oldLength === 0 || endLineNumber < oldStart || startLineNumber > oldEnd) {
      this.flush();
      this.rendLineNumberStart = startLineNumber;
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        const numEl = this.createNumberElement(line, line === activeLineNumber);
        this.container.appendChild(numEl);
        this.numbers.push(numEl);
      }
      return;
    }

    // Case 2: Scrolling down (startLineNumber > oldStart)
    if (startLineNumber > oldStart) {
      const removeCount = Math.min(oldLength, startLineNumber - oldStart);
      for (let i = 0; i < removeCount; i++) {
        const el = this.numbers[i];
        if (el.parentNode === this.container) {
          this.container.removeChild(el);
        }
      }
      this.numbers.splice(0, removeCount);
      this.rendLineNumberStart = startLineNumber;
    }

    // Case 3: Scrolling up (startLineNumber < oldStart)
    if (startLineNumber < this.rendLineNumberStart) {
      const firstChild = this.numbers[0] || null;
      const newNumbers: HTMLElement[] = [];
      for (let line = startLineNumber; line < this.rendLineNumberStart; line++) {
        const numEl = this.createNumberElement(line, line === activeLineNumber);
        this.container.insertBefore(numEl, firstChild);
        newNumbers.push(numEl);
      }
      this.numbers = newNumbers.concat(this.numbers);
      this.rendLineNumberStart = startLineNumber;
    }

    // Case 4: Scrolling down (endLineNumber > oldEnd)
    const currentEnd = this.rendLineNumberStart + this.numbers.length - 1;
    if (endLineNumber > currentEnd) {
      for (let line = currentEnd + 1; line <= endLineNumber; line++) {
        const numEl = this.createNumberElement(line, line === activeLineNumber);
        this.container.appendChild(numEl);
        this.numbers.push(numEl);
      }
    }

    // Case 5: Scrolling up (endLineNumber < currentEnd)
    const newEnd = this.rendLineNumberStart + this.numbers.length - 1;
    if (endLineNumber < newEnd) {
      const removeCount = newEnd - endLineNumber;
      const startIndex = this.numbers.length - removeCount;
      for (let i = startIndex; i < this.numbers.length; i++) {
        const el = this.numbers[i];
        if (el.parentNode === this.container) {
          this.container.removeChild(el);
        }
      }
      this.numbers.splice(startIndex, removeCount);
    }

    // Update active line highlighting
    for (let i = 0; i < this.numbers.length; i++) {
      const line = this.rendLineNumberStart + i;
      const el = this.numbers[i];
      if (line === activeLineNumber) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  }

  private createNumberElement(lineNumber: number, isActive: boolean): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mythic-line-number' + (isActive ? ' active' : '');
    el.style.height = `${this.viewport.lineHeight}px`;
    el.style.lineHeight = `${this.viewport.lineHeight}px`;
    el.style.top = `${this.viewport.getLineTop(lineNumber)}px`;
    el.textContent = lineNumber.toString();
    return el;
  }

  flush(): void {
    for (let i = 0; i < this.numbers.length; i++) {
      const el = this.numbers[i];
      if (el.parentNode === this.container) {
        this.container.removeChild(el);
      }
    }
    this.numbers = [];
    this.rendLineNumberStart = 1;
  }
}
