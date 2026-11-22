/**
 * Mythic Editor - Cursor Columns & Unicode Visual Grid Calculations
 *
 * Ported from Microsoft Monaco Editor (MIT License)
 * Reference:
 * - vs/editor/common/core/cursorColumns.ts (CursorColumns)
 * - vs/base/common/strings.ts (isFullWidthCharacter, isEmojiImprecise)
 *
 * Correctly maps 1-based UTF-16 model columns to screen visible columns,
 * ensuring emojis (including multi-byte surrogate pairs, ZWJ sequences,
 * skin tone modifiers, keycaps, and flags) and full-width CJK characters
 * occupy exactly 2 visual cells without cursor drift or misalignment.
 */

export function isFullWidthCharacter(charCode: number): boolean {
  return (
    (charCode >= 0x2e80 && charCode <= 0xd7af) ||
    (charCode >= 0xf900 && charCode <= 0xfaff) ||
    (charCode >= 0xff01 && charCode <= 0xff5e) ||
    (charCode >= 0xffe0 && charCode <= 0xffe6)
  );
}

/**
 * Fast check for emojis matching VS Code strings.isEmojiImprecise
 */
export function isEmoji(charCode: number): boolean {
  return (
    (charCode >= 0x1f1e6 && charCode <= 0x1f1ff) || // Regional indicator symbols (Flags)
    charCode === 8986 || // ⌚
    charCode === 8987 || // ⌛
    charCode === 9200 || // ⏰
    charCode === 9203 || // ⏳
    (charCode >= 9728 && charCode <= 10175) || // Miscellaneous symbols (⚡, ☀️, ❄️, etc.)
    charCode === 11088 || // ⭐
    charCode === 11093 || // ⭕
    (charCode >= 127744 && charCode <= 128591) || // Emoticons, Misc Symbols & Pictographs (🚀, 🔥, 😀, etc.)
    (charCode >= 128640 && charCode <= 128764) || // Transport & Map
    (charCode >= 128992 && charCode <= 129008) || // Geometric Shapes Extended
    (charCode >= 129280 && charCode <= 129535) || // Supplemental Symbols & Pictographs
    (charCode >= 129648 && charCode <= 129782)    // Symbols Extended-A
  );
}

const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export class CursorColumns {
  /**
   * Determine if a grapheme cluster represents a complex or multi-code-point emoji
   * (e.g. keycaps like 1️⃣, ZWJ sequences like 👨‍👩‍👧‍👦, skin tones like 👍🏽).
   */
  public static isComplexEmoji(grapheme: string): boolean {
    if (grapheme.length > 1) {
      if (grapheme.includes('\u200d') || grapheme.includes('\u20e3')) {
        return true;
      }
      for (const ch of grapheme) {
        const cp = ch.codePointAt(0) || 0;
        if (isEmoji(cp)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Determine the visual width (in columns) of a single grapheme cluster.
   */
  public static getGraphemeVisibleWidth(grapheme: string): number {
    const codePoint = grapheme.codePointAt(0) || 0;
    if (isFullWidthCharacter(codePoint) || isEmoji(codePoint) || this.isComplexEmoji(grapheme)) {
      return 2;
    }
    return 1;
  }

  /**
   * Advance visible column to the next tab stop (0-based columns).
   */
  public static nextRenderTabStop(visibleColumn: number, tabSize: number): number {
    return visibleColumn + tabSize - (visibleColumn % tabSize);
  }

  /**
   * Returns a 0-based visible column from a 1-based model column.
   * Mirrors Monaco's CursorColumns.visibleColumnFromColumn.
   */
  public static visibleColumnFromColumn(lineContent: string, column: number, tabSize: number = 4): number {
    if (!lineContent || column <= 1) {
      return 0;
    }

    const targetOffset = Math.min(column - 1, lineContent.length);
    let visibleColumn = 0;

    if (graphemeSegmenter) {
      for (const seg of graphemeSegmenter.segment(lineContent)) {
        if (seg.index >= targetOffset) {
          break;
        }
        const grapheme = seg.segment;
        const codePoint = grapheme.codePointAt(0) || 0;

        if (codePoint === 9) { // Tab
          visibleColumn = this.nextRenderTabStop(visibleColumn, tabSize);
        } else {
          visibleColumn += this.getGraphemeVisibleWidth(grapheme);
        }
      }
      return visibleColumn;
    }

    // Fallback if Intl.Segmenter is not present in runtime
    let i = 0;
    while (i < targetOffset) {
      const codePoint = lineContent.codePointAt(i) || 0;
      const charLen = codePoint > 0xffff ? 2 : 1;

      if (codePoint === 9) {
        visibleColumn = this.nextRenderTabStop(visibleColumn, tabSize);
      } else if (isFullWidthCharacter(codePoint) || isEmoji(codePoint)) {
        visibleColumn += 2;
      } else {
        visibleColumn += 1;
      }
      i += charLen;
    }

    return visibleColumn;
  }

  /**
   * Returns a 1-based model column from a 0-based visible column.
   * Mirrors Monaco's CursorColumns.columnFromVisibleColumn.
   */
  public static columnFromVisibleColumn(lineContent: string, visibleColumn: number, tabSize: number = 4): number {
    if (!lineContent || visibleColumn <= 0) {
      return 1;
    }

    const lineContentLength = lineContent.length;
    let beforeVisibleColumn = 0;
    let beforeColumn = 1;

    if (graphemeSegmenter) {
      for (const seg of graphemeSegmenter.segment(lineContent)) {
        const grapheme = seg.segment;
        const codePoint = grapheme.codePointAt(0) || 0;
        let width = 1;

        if (codePoint === 9) {
          const nextTab = this.nextRenderTabStop(beforeVisibleColumn, tabSize);
          width = nextTab - beforeVisibleColumn;
        } else {
          width = this.getGraphemeVisibleWidth(grapheme);
        }

        const afterVisibleColumn = beforeVisibleColumn + width;
        const afterColumn = seg.index + grapheme.length + 1;

        if (afterVisibleColumn >= visibleColumn) {
          const beforeDelta = visibleColumn - beforeVisibleColumn;
          const afterDelta = afterVisibleColumn - visibleColumn;
          if (afterDelta < beforeDelta) {
            return afterColumn;
          } else {
            return beforeColumn;
          }
        }

        beforeVisibleColumn = afterVisibleColumn;
        beforeColumn = afterColumn;
      }
      return lineContentLength + 1;
    }

    // Fallback if Intl.Segmenter is not present
    let i = 0;
    while (i < lineContentLength) {
      const codePoint = lineContent.codePointAt(i) || 0;
      const charLen = codePoint > 0xffff ? 2 : 1;
      let width = 1;

      if (codePoint === 9) {
        const nextTab = this.nextRenderTabStop(beforeVisibleColumn, tabSize);
        width = nextTab - beforeVisibleColumn;
      } else if (isFullWidthCharacter(codePoint) || isEmoji(codePoint)) {
        width = 2;
      }

      const afterVisibleColumn = beforeVisibleColumn + width;
      const afterColumn = i + charLen + 1;

      if (afterVisibleColumn >= visibleColumn) {
        const beforeDelta = visibleColumn - beforeVisibleColumn;
        const afterDelta = afterVisibleColumn - visibleColumn;
        return afterDelta < beforeDelta ? afterColumn : beforeColumn;
      }

      beforeVisibleColumn = afterVisibleColumn;
      beforeColumn = afterColumn;
      i += charLen;
    }

    return lineContentLength + 1;
  }

  /**
   * Find the next grapheme cluster boundary (1-based column).
   */
  public static nextGraphemeBoundary(lineContent: string, column: number): number {
    const offset = Math.max(0, column - 1);
    if (offset >= lineContent.length) {
      return lineContent.length + 1;
    }

    if (graphemeSegmenter) {
      for (const seg of graphemeSegmenter.segment(lineContent)) {
        if (seg.index >= offset) {
          return seg.index + seg.segment.length + 1;
        }
      }
    }

    // Fallback
    const codePoint = lineContent.codePointAt(offset) || 0;
    const charLen = codePoint > 0xffff ? 2 : 1;
    return Math.min(lineContent.length + 1, column + charLen);
  }

  /**
   * Find the previous grapheme cluster boundary (1-based column).
   */
  public static prevGraphemeBoundary(lineContent: string, column: number): number {
    const offset = Math.max(0, column - 1);
    if (offset <= 0) {
      return 1;
    }

    if (graphemeSegmenter) {
      let prevBoundary = 1;
      for (const seg of graphemeSegmenter.segment(lineContent)) {
        if (seg.index >= offset) {
          return prevBoundary;
        }
        prevBoundary = seg.index + 1;
      }
      return prevBoundary;
    }

    // Fallback
    if (offset >= 2) {
      const codeBefore = lineContent.charCodeAt(offset - 1);
      const codeBeforeBefore = lineContent.charCodeAt(offset - 2);
      if (codeBefore >= 0xdc00 && codeBefore <= 0xdfff && codeBeforeBefore >= 0xd800 && codeBeforeBefore <= 0xdbff) {
        return Math.max(1, column - 2);
      }
    }
    return Math.max(1, column - 1);
  }
}
