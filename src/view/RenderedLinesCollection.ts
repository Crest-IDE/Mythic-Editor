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
import { RangeUtil } from './RangeUtil';
import { IInvalidBracket } from '../core/language/BracketMatching';

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
  private invalidBracketsMap: Map<number, IInvalidBracket[]> = new Map();

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
   * Set or update invalid bracket decorations.
   */
  setInvalidBrackets(invalidBrackets: IInvalidBracket[]): void {
    this.invalidBracketsMap.clear();
    for (const b of invalidBrackets) {
      const line = b.range.startLineNumber;
      let list = this.invalidBracketsMap.get(line);
      if (!list) {
        list = [];
        this.invalidBracketsMap.set(line, list);
      }
      list.push(b);
    }
  }

  getInvalidBrackets(lineNumber: number): IInvalidBracket[] | undefined {
    return this.invalidBracketsMap.get(lineNumber);
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
   * Get the rendered DOM line element for a 1-based line number if currently in viewport.
   */
  getLineElement(lineNumber: number): HTMLElement | undefined {
    return this.renderedMap.get(lineNumber);
  }

  /**
   * Reads precise horizontal sub-pixel offset for a 1-based column from the rendered DOM element.
   * Returns null if line is not currently rendered or running in headless environment.
   */
  getHorizontalOffset(lineNumber: number, column: number): number | null {
    const lineEl = this.renderedMap.get(lineNumber);
    if (!lineEl) {
      return null;
    }
    return RangeUtil.readHorizontalOffset(lineEl, column - 1);
  }

  /**
   * Maps a DOM node and character offset back to a 1-based column.
   */
  getColumnFromNodeOffset(lineNumber: number, targetNode: Node, nodeOffset: number): number | null {
    const lineEl = this.renderedMap.get(lineNumber);
    if (!lineEl) {
      return null;
    }
    return RangeUtil.getColumnFromNodeOffset(lineEl, targetNode, nodeOffset);
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
   * Internal line content renderer supporting both plain text, tokenized spans,
   * and unexpected / unclosed bracket highlighting.
   * Derived from VS Code view line renderer and colorizedBracketPairsDecorationProvider.
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
    const invalidBrackets = this.invalidBracketsMap.get(line);

    // Fast path: no tokens and no invalid brackets for this line, render plain text directly
    if ((!tokens || tokens.length === 0) && (!invalidBrackets || invalidBrackets.length === 0)) {
      lineEl.textContent = text;
      return;
    }

    const len = text.length;
    const boundarySet = new Set<number>([0, len]);

    if (tokens) {
      for (const t of tokens) {
        boundarySet.add(Math.max(0, Math.min(len, t.startIndex)));
        boundarySet.add(Math.max(0, Math.min(len, t.endIndex)));
      }
    }

    if (invalidBrackets) {
      for (const b of invalidBrackets) {
        // Convert 1-based columns to 0-based character offsets
        const startOffset = Math.max(0, Math.min(len, b.range.startColumn - 1));
        const endOffset = Math.max(0, Math.min(len, b.range.endColumn - 1));
        boundarySet.add(startOffset);
        boundarySet.add(endOffset);
      }
    }

    const boundaries = Array.from(boundarySet).sort((a, b) => a - b);
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      if (start >= end) {
        continue;
      }

      const sliceText = text.slice(start, end);
      if (!sliceText) {
        continue;
      }

      // Check if this slice falls within an invalid bracket
      const isInvalid = invalidBrackets?.some(b => {
        const bStart = b.range.startColumn - 1;
        const bEnd = b.range.endColumn - 1;
        return start >= bStart && end <= bEnd;
      }) ?? false;

      // Find the covering token if any (taking the latest / most specific if overlapping)
      let tokenType: string | undefined;
      if (tokens) {
        for (const t of tokens) {
          if (start >= t.startIndex && end <= t.endIndex) {
            tokenType = t.type;
            break;
          }
        }
      }

      if (isInvalid || tokenType) {
        const span = document.createElement('span');
        const classes: string[] = [];

        if (tokenType) {
          const sanitizedType = tokenType.replace(/[^a-zA-Z0-9_-]/g, '-');
          const baseType = sanitizedType.split('-')[0];
          if (baseType !== sanitizedType) {
            classes.push(`mtk-${sanitizedType}`, `mythic-token-${sanitizedType}`, `mtk-${baseType}`, `mythic-token-${baseType}`);
          } else {
            classes.push(`mtk-${sanitizedType}`, `mythic-token-${sanitizedType}`);
          }
        }

        if (isInvalid) {
          // Faithfully matches VS Code colorizedBracketPairsDecorationProvider:
          // 'unexpected-closing-bracket' class applied to invalid bracket
          classes.push('unexpected-closing-bracket', 'mtk-unexpected-closing-bracket');
        }

        span.className = classes.join(' ');
        span.textContent = sliceText;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(sliceText));
      }
    }

    if (typeof (lineEl as any).replaceChildren === 'function') {
      lineEl.replaceChildren(fragment);
    } else {
      while (lineEl.childNodes && lineEl.childNodes.length > 0) {
        lineEl.removeChild(lineEl.childNodes[0]);
      }
      lineEl.appendChild(fragment);
    }
  }
}
