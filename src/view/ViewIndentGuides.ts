/**
 * Mythic Editor - View Indent Guides Overlay
 *
 * Faithfully ported from Microsoft Monaco Editor / VS Code source (MIT License)
 * Reference:
 * - vs/editor/browser/viewParts/indentGuides/indentGuides.ts (IndentGuidesOverlay)
 * - vs/editor/browser/view/viewOverlays.ts (ViewOverlays / ViewOverlayLine)
 *
 * Renders virtualized vertical indentation guides per visible line, including
 * active scope highlighting (`indent-active`) matching VS Code's CSS box-shadow design.
 */

import { ITextBuffer } from '../core/buffer/ITextBuffer';
import {
  IActiveIndentGuideInfo,
  IIndentGuidesComputeOptions,
  IndentGuides
} from '../core/language/IndentGuides';
import { Viewport } from './Viewport';

export interface IGuidesOptions {
  /**
   * Enable rendering of indent guides.
   * Defaults to true.
   */
  indentation?: boolean;

  /**
   * Enable highlighting of the active indent guide.
   * Defaults to true.
   */
  highlightActiveIndentation?: boolean | 'always';
}

interface ICachedGuideRow {
  rowEl: HTMLElement;
  signature: string;
}

export class ViewIndentGuides {
  readonly container: HTMLElement;
  private readonly viewport: Viewport;
  private options: Required<IGuidesOptions>;
  private lineRows: Map<number, ICachedGuideRow> = new Map();
  private lastActiveGuide: IActiveIndentGuideInfo | null = null;

  constructor(viewport: Viewport, options: IGuidesOptions = {}) {
    this.viewport = viewport;
    this.options = {
      indentation: options.indentation ?? true,
      highlightActiveIndentation: options.highlightActiveIndentation ?? true
    };

    this.container = document.createElement('div');
    this.container.className = 'mythic-indent-guides-layer';
    this.container.setAttribute('role', 'presentation');
    this.container.setAttribute('aria-hidden', 'true');
  }

  getOptions(): Required<IGuidesOptions> {
    return { ...this.options };
  }

  setOptions(options: IGuidesOptions): void {
    this.options = {
      indentation: options.indentation ?? this.options.indentation,
      highlightActiveIndentation: options.highlightActiveIndentation ?? this.options.highlightActiveIndentation
    };
  }

  getLastActiveGuide(): IActiveIndentGuideInfo | null {
    return this.lastActiveGuide;
  }

  getLineRowElement(lineNumber: number): HTMLElement | undefined {
    return this.lineRows.get(lineNumber)?.rowEl;
  }

  /**
   * Synchronize indent guide vertical lines across visible lines in the viewport.
   */
  update(
    startLineNumber: number,
    endLineNumber: number,
    buffer: ITextBuffer,
    activeCursorLine: number,
    computeOptions: IIndentGuidesComputeOptions,
    scrollWidth: number = Number.MAX_SAFE_INTEGER
  ): void {
    if (!this.options.indentation) {
      this.clear();
      this.lastActiveGuide = null;
      return;
    }

    const lineCount = buffer.getLineCount();
    if (lineCount <= 0) {
      this.clear();
      this.lastActiveGuide = null;
      return;
    }

    const clampedStart = Math.max(1, Math.min(startLineNumber, lineCount));
    const clampedEnd = Math.max(clampedStart, Math.min(endLineNumber, lineCount));
    const searchEnd = Math.min(clampedEnd + 1, lineCount);

    const tabSize = Math.max(1, computeOptions.tabSize);
    const indentSize = Math.max(1, computeOptions.indentSize ?? tabSize);
    const spaceWidth = this.viewport.spaceWidth || this.viewport.charWidth;

    const indents = IndentGuides.getLinesIndentGuides(buffer, clampedStart, clampedEnd, computeOptions);

    let activeIndentStartLineNumber = 0;
    let activeIndentEndLineNumber = 0;
    let activeIndentLevel = 0;

    if (this.options.highlightActiveIndentation !== false && activeCursorLine >= 1 && activeCursorLine <= lineCount) {
      const activeInfo = IndentGuides.getActiveIndentGuide(
        buffer,
        activeCursorLine,
        clampedStart,
        searchEnd,
        computeOptions
      );
      activeIndentStartLineNumber = activeInfo.startLineNumber;
      activeIndentEndLineNumber = activeInfo.endLineNumber;
      activeIndentLevel = activeInfo.indent;
      this.lastActiveGuide = activeInfo;
    } else {
      this.lastActiveGuide = null;
    }

    const activeLines = new Set<number>();

    for (let lineNumber = clampedStart; lineNumber <= clampedEnd; lineNumber++) {
      const indentGuidesInLine = indents[lineNumber - clampedStart];
      if (indentGuidesInLine <= 0) {
        continue;
      }

      const isLineInActiveRange =
        this.options.highlightActiveIndentation !== false &&
        activeIndentLevel >= 1 &&
        activeIndentStartLineNumber <= lineNumber &&
        lineNumber <= activeIndentEndLineNumber;
      const activeLvlOnLine = isLineInActiveRange && activeIndentLevel <= indentGuidesInLine
        ? activeIndentLevel
        : 0;

      const visibleGuidesCount = this.countVisibleGuides(indentGuidesInLine, indentSize, spaceWidth, scrollWidth);
      if (visibleGuidesCount <= 0) {
        continue;
      }

      activeLines.add(lineNumber);
      const top = this.viewport.getLineTop(lineNumber);
      const height = this.viewport.lineHeight;
      const signature = `${visibleGuidesCount}|${activeLvlOnLine}|${indentSize}|${spaceWidth}`;

      const cached = this.lineRows.get(lineNumber);
      if (!cached) {
        const rowEl = document.createElement('div');
        rowEl.className = 'mythic-indent-guide-row';
        rowEl.style.top = `${top}px`;
        rowEl.style.height = `${height}px`;

        const guideNodes = this.createGuideElements(visibleGuidesCount, activeLvlOnLine, indentSize, spaceWidth);
        for (const node of guideNodes) {
          rowEl.appendChild(node);
        }

        this.container.appendChild(rowEl);
        this.lineRows.set(lineNumber, { rowEl, signature });
      } else {
        cached.rowEl.style.top = `${top}px`;
        cached.rowEl.style.height = `${height}px`;

        if (cached.signature !== signature) {
          const guideNodes = this.createGuideElements(visibleGuidesCount, activeLvlOnLine, indentSize, spaceWidth);
          if (typeof cached.rowEl.replaceChildren === 'function') {
            cached.rowEl.replaceChildren(...guideNodes);
          } else {
            for (const node of guideNodes) {
              cached.rowEl.appendChild(node);
            }
          }
          cached.signature = signature;
        }
      }
    }

    // Prune rows that are outside the visible range or no longer have guides
    for (const [line, cached] of this.lineRows.entries()) {
      if (!activeLines.has(line)) {
        if (cached.rowEl.parentNode === this.container) {
          this.container.removeChild(cached.rowEl);
        }
        this.lineRows.delete(line);
      }
    }
  }

  private countVisibleGuides(
    indentGuidesInLine: number,
    indentSize: number,
    spaceWidth: number,
    scrollWidth: number
  ): number {
    let count = 0;
    for (let indentLvl = 1; indentLvl <= indentGuidesInLine; indentLvl++) {
      const left = (indentLvl - 1) * indentSize * spaceWidth;
      if (left > scrollWidth) {
        break;
      }
      count++;
    }
    return count;
  }

  private createGuideElements(
    visibleGuidesCount: number,
    activeLvlOnLine: number,
    indentSize: number,
    spaceWidth: number
  ): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    for (let indentLvl = 1; indentLvl <= visibleGuidesCount; indentLvl++) {
      const left = (indentLvl - 1) * indentSize * spaceWidth;
      const isActive = indentLvl === activeLvlOnLine;

      const guideEl = document.createElement('div');
      guideEl.className = `core-guide core-guide-indent lvl-${(indentLvl - 1) % 30}${isActive ? ' indent-active' : ''} vertical`;
      guideEl.style.left = `${left}px`;
      guideEl.style.width = `${spaceWidth}px`;
      nodes.push(guideEl);
    }
    return nodes;
  }

  clear(): void {
    for (const cached of this.lineRows.values()) {
      if (cached.rowEl.parentNode === this.container) {
        this.container.removeChild(cached.rowEl);
      }
    }
    this.lineRows.clear();
  }

  flush(): void {
    this.clear();
    this.lastActiveGuide = null;
  }
}
