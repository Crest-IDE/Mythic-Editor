/**
 * Mythic Editor - Virtualized Rendered Lines Collection
 *
 * Ported directly from Microsoft Monaco Editor (MIT License)
 * Reference: vs/editor/browser/view/viewLayer.ts (ViewLayerRenderer & RenderedLinesCollection)
 *
 * Efficiently manages line DOM nodes inside the viewport using Monaco's sliding window
 * algorithm, recycling existing nodes across scroll frames and only instantiating
 * lines entering the viewport.
 */

import { ITextBuffer } from '../core/buffer/ITextBuffer';
import { Viewport } from './Viewport';

export class RenderedLinesCollection {
  private readonly container: HTMLElement;
  private readonly viewport: Viewport;
  private lines: HTMLElement[] = [];
  private rendLineNumberStart: number = 1;

  constructor(container: HTMLElement, viewport: Viewport) {
    this.container = container;
    this.viewport = viewport;
  }

  getStartLineNumber(): number {
    return this.rendLineNumberStart;
  }

  getEndLineNumber(): number {
    return this.rendLineNumberStart + this.lines.length - 1;
  }

  getCount(): number {
    return this.lines.length;
  }

  /**
   * Synchronize rendered DOM lines with the current visible range using Monaco's sliding window.
   */
  update(startLineNumber: number, endLineNumber: number, buffer: ITextBuffer): void {
    const oldStart = this.rendLineNumberStart;
    const oldLength = this.lines.length;
    const oldEnd = oldStart + oldLength - 1;

    // Case 1: No lines currently, or zero overlap (jump/flushed scroll)
    if (oldLength === 0 || endLineNumber < oldStart || startLineNumber > oldEnd) {
      this.flush();
      this.rendLineNumberStart = startLineNumber;
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        const lineEl = this.createLineElement(line, buffer);
        this.container.appendChild(lineEl);
        this.lines.push(lineEl);
      }
      return;
    }

    // Case 2: Scrolling down (startLineNumber > oldStart)
    // Remove lines that scrolled above the top
    if (startLineNumber > oldStart) {
      const removeCount = Math.min(oldLength, startLineNumber - oldStart);
      for (let i = 0; i < removeCount; i++) {
        const el = this.lines[i];
        if (el.parentNode === this.container) {
          this.container.removeChild(el);
        }
      }
      this.lines.splice(0, removeCount);
      this.rendLineNumberStart = startLineNumber;
    }

    // Case 3: Scrolling up (startLineNumber < oldStart)
    // Insert new lines before the first line
    if (startLineNumber < this.rendLineNumberStart) {
      const firstChild = this.lines[0] || null;
      const newLines: HTMLElement[] = [];
      for (let line = startLineNumber; line < this.rendLineNumberStart; line++) {
        const lineEl = this.createLineElement(line, buffer);
        this.container.insertBefore(lineEl, firstChild);
        newLines.push(lineEl);
      }
      this.lines = newLines.concat(this.lines);
      this.rendLineNumberStart = startLineNumber;
    }

    // Case 4: Scrolling down (endLineNumber > oldEnd)
    // Append new lines after the last line
    const currentEnd = this.rendLineNumberStart + this.lines.length - 1;
    if (endLineNumber > currentEnd) {
      for (let line = currentEnd + 1; line <= endLineNumber; line++) {
        const lineEl = this.createLineElement(line, buffer);
        this.container.appendChild(lineEl);
        this.lines.push(lineEl);
      }
    }

    // Case 5: Scrolling up (endLineNumber < currentEnd)
    // Remove lines that scrolled below the bottom
    const newEnd = this.rendLineNumberStart + this.lines.length - 1;
    if (endLineNumber < newEnd) {
      const removeCount = newEnd - endLineNumber;
      const startIndex = this.lines.length - removeCount;
      for (let i = startIndex; i < this.lines.length; i++) {
        const el = this.lines[i];
        if (el.parentNode === this.container) {
          this.container.removeChild(el);
        }
      }
      this.lines.splice(startIndex, removeCount);
    }
  }

  private createLineElement(lineNumber: number, buffer: ITextBuffer): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mythic-view-line';
    el.style.height = `${this.viewport.lineHeight}px`;
    el.style.lineHeight = `${this.viewport.lineHeight}px`;
    el.style.top = `${this.viewport.getLineTop(lineNumber)}px`;
    el.textContent = buffer.getLineContent(lineNumber) || '\u00a0';
    return el;
  }

  /**
   * Force refresh all currently rendered line contents and vertical positions.
   */
  refresh(buffer: ITextBuffer): void {
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.rendLineNumberStart + i;
      const el = this.lines[i];
      el.style.top = `${this.viewport.getLineTop(line)}px`;
      el.textContent = buffer.getLineContent(line) || '\u00a0';
    }
  }

  /**
   * Flush all DOM line nodes.
   */
  flush(): void {
    for (let i = 0; i < this.lines.length; i++) {
      const el = this.lines[i];
      if (el.parentNode === this.container) {
        this.container.removeChild(el);
      }
    }
    this.lines = [];
    this.rendLineNumberStart = 1;
  }
}
