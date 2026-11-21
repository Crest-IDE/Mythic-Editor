/**
 * Mythic Editor - Virtualized Rendered Lines Collection with Tokenization Support
 *
 * Portions derived from Microsoft Monaco Editor (MIT License)
 * Reference: vs/editor/browser/view/viewLayer.js (RenderedLinesCollection)
 *
 * Efficiently manages line DOM nodes inside the viewport, recycling existing
 * nodes across scroll frames and rendering syntax-highlighted tokens (Tree-sitter/LSP).
 */

import { ITextBuffer } from '../core/buffer/ITextBuffer';
import { Viewport } from './Viewport';

export interface ILineToken {
  startIndex: number;
  endIndex: number;
  type: string;
}

export interface ILineTokensProvider {
  getLineTokens(lineNumber: number): ILineToken[] | undefined;
}

export class RenderedLinesCollection {
  private readonly container: HTMLElement;
  private readonly viewport: Viewport;
  private renderedMap: Map<number, HTMLElement> = new Map();
  private tokensProvider: ILineTokensProvider | null = null;

  constructor(
    container: HTMLElement,
    viewport: Viewport,
    tokensProvider: ILineTokensProvider | null = null
  ) {
    this.container = container;
    this.viewport = viewport;
    this.tokensProvider = tokensProvider;
  }

  /**
   * Attach or update the syntax tokens provider (e.g. Tree-sitter highlighter).
   */
  setTokensProvider(provider: ILineTokensProvider | null): void {
    this.tokensProvider = provider;
  }

  getTokensProvider(): ILineTokensProvider | null {
    return this.tokensProvider;
  }

  /**
   * Synchronize rendered DOM lines with the current visible range.
   */
  update(
    startLineNumber: number,
    endLineNumber: number,
    buffer: ITextBuffer,
    tokensProvider?: ILineTokensProvider
  ): void {
    const provider = tokensProvider ?? this.tokensProvider;
    const activeLines = new Set<number>();

    for (let line = startLineNumber; line <= endLineNumber; line++) {
      activeLines.add(line);
      let lineEl = this.renderedMap.get(line);

      if (!lineEl) {
        lineEl = document.createElement('div');
        lineEl.className = 'mythic-view-line';
        lineEl.style.height = `${this.viewport.lineHeight}px`;
        lineEl.style.lineHeight = `${this.viewport.lineHeight}px`;
        lineEl.style.top = `${this.viewport.getLineTop(line)}px`;

        this.renderLineContent(lineEl, line, buffer, provider);
        this.container.appendChild(lineEl);
        this.renderedMap.set(line, lineEl);
      }
    }

    // Remove nodes that scrolled outside the visible window
    for (const [line, el] of this.renderedMap.entries()) {
      if (!activeLines.has(line)) {
        if (el.parentNode === this.container) {
          this.container.removeChild(el);
        }
        this.renderedMap.delete(line);
      }
    }
  }

  /**
   * Force refresh all currently rendered line contents.
   */
  refresh(buffer: ITextBuffer, tokensProvider?: ILineTokensProvider): void {
    const provider = tokensProvider ?? this.tokensProvider;
    for (const [line, el] of this.renderedMap.entries()) {
      el.style.top = `${this.viewport.getLineTop(line)}px`;
      this.renderLineContent(el, line, buffer, provider);
    }
  }

  /**
   * Refresh a single line's rendering (useful when Tree-sitter finishes an incremental update).
   */
  refreshLine(line: number, buffer: ITextBuffer, tokensProvider?: ILineTokensProvider): void {
    const lineEl = this.renderedMap.get(line);
    if (lineEl) {
      const provider = tokensProvider ?? this.tokensProvider;
      this.renderLineContent(lineEl, line, buffer, provider);
    }
  }

  /**
   * Flush all DOM line nodes.
   */
  flush(): void {
    for (const el of this.renderedMap.values()) {
      if (el.parentNode === this.container) {
        this.container.removeChild(el);
      }
    }
    this.renderedMap.clear();
  }

  /**
   * Internal line content renderer supporting both plain text and tokenized spans.
   */
  private renderLineContent(
    lineEl: HTMLElement,
    line: number,
    buffer: ITextBuffer,
    provider: ILineTokensProvider | null
  ): void {
    const text = buffer.getLineContent(line);

    // Empty line: non-breaking space for line height preservation
    if (!text) {
      lineEl.textContent = '\u00a0';
      return;
    }

    const tokens = provider ? provider.getLineTokens(line) : undefined;

    // Fast path: no tokens for this line, render plain text directly
    if (!tokens || tokens.length === 0) {
      lineEl.textContent = text;
      return;
    }

    // Tokenized path: slice text into spans and plain text gaps
    const fragment = document.createDocumentFragment();
    let currentIdx = 0;
    const len = text.length;

    // Ensure tokens are sorted by start index
    const sortedTokens = [...tokens].sort((a, b) => a.startIndex - b.startIndex);

    for (const token of sortedTokens) {
      const start = Math.max(0, Math.min(len, token.startIndex));
      const end = Math.max(start, Math.min(len, token.endIndex));

      // Append text gap before token
      if (start > currentIdx) {
        const gapText = text.slice(currentIdx, start);
        fragment.appendChild(document.createTextNode(gapText));
        currentIdx = start;
      }

      // Append styled token span
      if (end > currentIdx) {
        const span = document.createElement('span');
        const sanitizedType = token.type.replace(/[^a-zA-Z0-9_-]/g, '-');
        span.className = `mtk-${sanitizedType} mythic-token-${sanitizedType}`;
        span.textContent = text.slice(currentIdx, end);
        fragment.appendChild(span);
        currentIdx = end;
      }
    }

    // Append any trailing plain text
    if (currentIdx < len) {
      fragment.appendChild(document.createTextNode(text.slice(currentIdx)));
    }

    lineEl.replaceChildren(fragment);
  }
}
