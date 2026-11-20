/**
 * Mythic Editor - Auto Closing Pairs & Bracket Matching
 *
 * Ported directly from Microsoft Monaco Editor (MIT License)
 * Reference:
 * - vs/editor/common/languages/supports/characterPair.ts (CharacterPairSupport)
 * - vs/editor/common/cursor/cursorTypeEditOperations.ts (AutoClosingOpenCharTypeOperation, AutoClosingOvertypeOperation, SurroundSelectionOperation)
 * - vs/editor/common/cursor/cursorDeleteOperations.ts (isAutoClosingPairDelete)
 * - vs/editor/common/commands/surroundSelectionCommand.ts (SurroundSelectionCommand)
 */

export interface IAutoClosingPair {
  readonly open: string;
  readonly close: string;
}

export class AutoClosingPairs {
  // Monaco default auto-close before character sets
  // Reference: vs/editor/common/languages/supports/characterPair.ts lines 10-12
  private static readonly AUTOCLOSE_BEFORE_QUOTES = ';:.,=}])> \n\t';
  private static readonly AUTOCLOSE_BEFORE_BRACKETS = '\'"`;:.,=}])> \n\t';

  // Standard universal programming language pairs
  public static readonly DEFAULT_PAIRS: IAutoClosingPair[] = [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '`', close: '`' },
  ];

  // Fast lookups
  private static readonly OPEN_TO_CLOSE: Map<string, string> = new Map(
    AutoClosingPairs.DEFAULT_PAIRS.map((p) => [p.open, p.close])
  );

  private static readonly CLOSE_TO_OPEN: Map<string, string> = new Map(
    AutoClosingPairs.DEFAULT_PAIRS.map((p) => [p.close, p.open])
  );

  /**
   * Check if character is a quote
   * Reference: vs/editor/common/cursorCommon.ts line 433 (isQuote)
   */
  public static isQuote(ch: string): boolean {
    return ch === '\'' || ch === '"' || ch === '`';
  }

  /**
   * Check if character is a word character (a-z, A-Z, 0-9, _)
   */
  public static isWordCharacter(ch: string): boolean {
    return /[a-zA-Z0-9_]/.test(ch);
  }

  /**
   * Check if typing `ch` over an existing selection should surround it with brackets.
   * Reference: vs/editor/common/cursor/cursorTypeEditOperations.ts line 450 (SurroundSelectionOperation)
   */
  public static shouldSurround(ch: string, selectedText: string): string | null {
    const close = this.OPEN_TO_CLOSE.get(ch);
    if (!close) {
      return null;
    }
    if (!selectedText || selectedText.length === 0) {
      return null;
    }
    return close;
  }

  /**
   * Check if typing `ch` when cursor is right before the matching close character should overtype (skip) it.
   * Reference: vs/editor/common/cursor/cursorTypeEditOperations.ts line 1048 (isAutoClosingOvertype)
   */
  public static isOvertype(ch: string, charAfterCursor: string, charBeforeCursor?: string): boolean {
    if (!this.CLOSE_TO_OPEN.has(ch)) {
      return false;
    }
    if (charAfterCursor !== ch) {
      return false;
    }
    // Do not overtype quote after backslash (escaped quote)
    if (this.isQuote(ch) && charBeforeCursor === '\\') {
      return false;
    }
    return true;
  }

  /**
   * Check if typing open bracket `ch` should automatically insert its matching closing bracket.
   * Reference: vs/editor/common/cursor/cursorTypeEditOperations.ts lines 209-302 (getAutoClosingPair)
   */
  public static shouldAutoClose(ch: string, charBefore: string, charAfter: string): string | null {
    const close = this.OPEN_TO_CLOSE.get(ch);
    if (!close) {
      return null;
    }

    const isQuoteChar = this.isQuote(ch);

    // 1. Check character before:
    // Do not auto-close ' or " after a word character (e.g. typing don't should not become don''t)
    // Reference: vs/editor/common/cursor/cursorTypeEditOperations.ts lines 293-301
    if (isQuoteChar && charBefore && this.isWordCharacter(charBefore)) {
      return null;
    }
    // Do not auto-close quotes after backslash (escaped quote)
    if (isQuoteChar && charBefore === '\\') {
      return null;
    }

    // 2. Check character after:
    // Only auto-close if allowed character follows (whitespace, end of line, or closing punctuation)
    // Reference: vs/editor/common/cursor/cursorTypeEditOperations.ts lines 276-281
    if (charAfter && charAfter.length > 0) {
      const allowedBefore = isQuoteChar
        ? this.AUTOCLOSE_BEFORE_QUOTES
        : this.AUTOCLOSE_BEFORE_BRACKETS;
      if (!allowedBefore.includes(charAfter)) {
        return null;
      }
    }

    return close;
  }

  /**
   * Check if backspace should delete both open and close brackets when cursor is between them.
   * Reference: vs/editor/common/cursor/cursorDeleteOperations.ts line 75 (isAutoClosingPairDelete)
   */
  public static shouldAutoDeletePair(charBefore: string, charAfter: string): boolean {
    if (!charBefore || !charAfter) {
      return false;
    }
    const expectedClose = this.OPEN_TO_CLOSE.get(charBefore);
    return expectedClose !== undefined && expectedClose === charAfter;
  }
}
