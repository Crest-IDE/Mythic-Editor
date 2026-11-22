/**
 * Mythic Editor - View Current Line Highlight Overlay
 *
 * Ported from Microsoft Monaco Editor (MIT License)
 * Reference: vs/editor/browser/viewParts/currentLineHighlight/currentLineHighlight.ts
 *
 * Emphasizes the line containing the active cursor by rendering a subtle highlight
 * across the editor canvas and margin, matching VS Code's editor.lineHighlightBackground.
 */

import { Viewport } from './Viewport';

export type LineHighlightMode = 'all' | 'line' | 'gutter' | 'none';

export class ViewCurrentLineHighlight {
  readonly element: HTMLElement;
  private readonly viewport: Viewport;
  private currentLine: number = 1;
  private isVisible: boolean = false;
  private mode: LineHighlightMode = 'all';

  constructor(viewport: Viewport, mode: LineHighlightMode = 'all') {
    this.viewport = viewport;
    this.mode = mode;

    this.element = document.createElement('div');
    this.element.className = 'mythic-current-line-highlight';
    this.element.style.height = `${viewport.lineHeight}px`;
    this.element.style.top = '0px';
    this.element.style.left = '0px';
    this.element.style.display = 'none';
  }

  setMode(mode: LineHighlightMode): void {
    this.mode = mode;
  }

  getMode(): LineHighlightMode {
    return this.mode;
  }

  getCurrentLine(): number {
    return this.currentLine;
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  update(activeLineNumber: number, selectionIsEmpty: boolean, isFocused: boolean = true): void {
    this.currentLine = activeLineNumber;

    const shouldShow =
      (this.mode === 'all' || this.mode === 'line') &&
      selectionIsEmpty &&
      activeLineNumber >= 1;

    if (!shouldShow) {
      if (this.isVisible) {
        this.element.style.display = 'none';
        this.isVisible = false;
      }
      return;
    }

    if (!this.isVisible) {
      this.element.style.display = 'block';
      this.isVisible = true;
    }

    const top = this.viewport.getLineTop(activeLineNumber);
    this.element.style.transform = `translate3d(0, ${top}px, 0)`;
    this.element.style.height = `${this.viewport.lineHeight}px`;

    if (isFocused) {
      this.element.classList.remove('inactive');
    } else {
      this.element.classList.add('inactive');
    }
  }

  updateWidth(width: number): void {
    const targetWidth = Math.max(width, this.viewport.width);
    this.element.style.width = `${targetWidth}px`;
  }
}
