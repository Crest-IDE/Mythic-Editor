/**
 * Mythic Editor - View Bracket Match Overlay (Box Outline Highlighting)
 *
 * Faithfully ported from Microsoft Monaco Editor / VS Code source (MIT License)
 * Reference: vs/editor/contrib/bracketMatching/browser/bracketMatching.ts
 * Reference: vs/editor/contrib/bracketMatching/browser/bracketMatching.css
 *
 * Renders individual rectangular box outlines around matching open and close brackets:
 * - 1px thin grey rectangular border around '('
 * - Same rectangular border around ')'
 * - Original syntax color remains 100% unchanged
 * - Background color is transparent (does not change background)
 * - Wraps both brackets individually as distinct elements
 */

import { BracketMatch } from '../core/language/BracketMatching';
import { Viewport } from './Viewport';
import { ITextBuffer } from '../core/buffer/ITextBuffer';
import { Range } from '../core/model/Range';

export class ViewBracketMatch {
  readonly container: HTMLElement;
  private readonly viewport: Viewport;
  private openEl: HTMLElement | null = null;
  private closeEl: HTMLElement | null = null;
  private currentMatch: BracketMatch | null = null;
  private isCurrentlyMerged: boolean = false;

  constructor(viewport: Viewport) {
    this.viewport = viewport;
    this.container = document.createElement('div');
    this.container.className = 'mythic-bracket-match-layer';
  }

  /**
   * Update the bracket match box outlines for the active bracket pair.
   *
   * Monaco / VS Code Merge Rule (vs/editor/browser/viewParts/decorations/decorations.ts):
   * When brackets are touching / adjacent (e.g. `()` or `{}` or `[]`),
   * Range.areIntersectingOrTouching(open, close) evaluates to true.
   * In that case, the two decorations merge via Range.plusRange(open, close)
   * into a single unified continuous box outline enclosing both brackets without
   * an internal divider!
   */
  update(
    match: BracketMatch | null,
    buffer: ITextBuffer,
    offsetProvider?: (lineNumber: number, column: number) => number | null
  ): void {
    this.currentMatch = match;

    if (!match) {
      this.clear();
      return;
    }

    const getOffset = (line: number, col: number) => {
      const measured = offsetProvider?.(line, col);
      if (measured !== null && measured !== undefined && (measured > 0 || col === 1)) {
        return measured;
      }
      const lineContent = buffer.getLineContent(line);
      return this.viewport.getColumnLeft(col, lineContent);
    };

    if (Range.areIntersectingOrTouching(match.open, match.close)) {
      this.isCurrentlyMerged = true;
      const mergedRange = Range.plusRange(match.open, match.close);
      this.renderBracketBox('open', mergedRange, getOffset);
      if (this.closeEl) {
        this.closeEl.style.display = 'none';
      }
    } else {
      this.isCurrentlyMerged = false;
      this.renderBracketBox('open', match.open, getOffset);
      this.renderBracketBox('close', match.close, getOffset);
    }
  }

  private renderBracketBox(
    type: 'open' | 'close',
    range: Range,
    getOffset: (line: number, col: number) => number
  ): void {
    let el = type === 'open' ? this.openEl : this.closeEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'mythic-bracket-match';
      this.container.appendChild(el);
      if (type === 'open') {
        this.openEl = el;
      } else {
        this.closeEl = el;
      }
    }

    const line = range.startLineNumber;
    const left = Math.round(getOffset(line, range.startColumn) * 100) / 100;
    const right = Math.round(getOffset(line, range.endColumn) * 100) / 100;
    const width = Math.round(Math.max(this.viewport.charWidth, right - left) * 100) / 100;
    const top = this.viewport.getLineTop(line);

    el.style.display = 'block';
    el.style.height = `${this.viewport.lineHeight}px`;
    el.style.width = `${width}px`;
    el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  /**
   * Clear active bracket highlights.
   */
  clear(): void {
    if (this.openEl) {
      this.openEl.style.display = 'none';
    }
    if (this.closeEl) {
      this.closeEl.style.display = 'none';
    }
    this.currentMatch = null;
    this.isCurrentlyMerged = false;
  }

  getCurrentMatch(): BracketMatch | null {
    return this.currentMatch;
  }

  isMerged(): boolean {
    return this.isCurrentlyMerged;
  }

  getOpenElement(): HTMLElement | null {
    return this.openEl;
  }

  getCloseElement(): HTMLElement | null {
    return this.closeEl;
  }
}
