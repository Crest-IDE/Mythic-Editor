import { describe, it, expect } from 'vitest';
import { AutoClosingPairs } from '@mythic/view/AutoClosingPairs';

describe('AutoClosingPairs (Monaco Port)', () => {
  it('identifies quote characters correctly matching Monaco', () => {
    expect(AutoClosingPairs.isQuote('"')).toBe(true);
    expect(AutoClosingPairs.isQuote("'")).toBe(true);
    expect(AutoClosingPairs.isQuote('`')).toBe(true);
    expect(AutoClosingPairs.isQuote('(')).toBe(false);
    expect(AutoClosingPairs.isQuote('a')).toBe(false);
  });

  it('determines auto-closing for brackets before whitespace and closing punctuation', () => {
    // Empty line / end of line
    expect(AutoClosingPairs.shouldAutoClose('(', '', '')).toBe(')');
    expect(AutoClosingPairs.shouldAutoClose('[', '', '')).toBe(']');
    expect(AutoClosingPairs.shouldAutoClose('{', '', '')).toBe('}');
    expect(AutoClosingPairs.shouldAutoClose('"', '', '')).toBe('"');
    expect(AutoClosingPairs.shouldAutoClose("'", '', '')).toBe("'");
    expect(AutoClosingPairs.shouldAutoClose('`', '', '')).toBe('`');

    // Before space or newline
    expect(AutoClosingPairs.shouldAutoClose('(', '', ' ')).toBe(')');
    expect(AutoClosingPairs.shouldAutoClose('{', '', '\n')).toBe('}');

    // Before closing punctuation ;:.,=}])>
    expect(AutoClosingPairs.shouldAutoClose('(', '', ';')).toBe(')');
    expect(AutoClosingPairs.shouldAutoClose('(', '', ')')).toBe(')');
  });

  it('does NOT auto-close brackets when immediately followed by a word character (Monaco rule)', () => {
    // If typing ( before abc, user is wrapping or writing expression; do not auto-close
    expect(AutoClosingPairs.shouldAutoClose('(', '', 'a')).toBe(null);
    expect(AutoClosingPairs.shouldAutoClose('[', '', 'x')).toBe(null);
    expect(AutoClosingPairs.shouldAutoClose('{', '', '1')).toBe(null);
  });

  it('does NOT auto-close quote after a word character (Monaco rule e.g. don\'t)', () => {
    expect(AutoClosingPairs.shouldAutoClose("'", 'n', 't')).toBe(null);
    expect(AutoClosingPairs.shouldAutoClose("'", 's', '')).toBe(null);
    expect(AutoClosingPairs.shouldAutoClose('"', 'a', '')).toBe(null);
  });

  it('does NOT auto-close quote after a backslash escape (Monaco rule)', () => {
    expect(AutoClosingPairs.shouldAutoClose('"', '\\', '')).toBe(null);
    expect(AutoClosingPairs.shouldAutoClose("'", '\\', '')).toBe(null);
  });

  it('detects overtype when typing matching closing bracket or quote', () => {
    // Cursor at (|) -> typing ) should overtype
    expect(AutoClosingPairs.isOvertype(')', ')', '(')).toBe(true);
    expect(AutoClosingPairs.isOvertype(']', ']', '[')).toBe(true);
    expect(AutoClosingPairs.isOvertype('}', '}', '{')).toBe(true);
    expect(AutoClosingPairs.isOvertype('"', '"', '"')).toBe(true);

    // If next character is different, do not overtype
    expect(AutoClosingPairs.isOvertype(')', 'x', '(')).toBe(false);

    // If quote is escaped by backslash, do not overtype
    expect(AutoClosingPairs.isOvertype('"', '"', '\\')).toBe(false);
  });

  it('detects auto pair deletion on backspace', () => {
    // Cursor at (|)
    expect(AutoClosingPairs.shouldAutoDeletePair('(', ')')).toBe(true);
    expect(AutoClosingPairs.shouldAutoDeletePair('[', ']')).toBe(true);
    expect(AutoClosingPairs.shouldAutoDeletePair('{', '}')).toBe(true);
    expect(AutoClosingPairs.shouldAutoDeletePair('"', '"')).toBe(true);
    expect(AutoClosingPairs.shouldAutoDeletePair("'", "'")).toBe(true);
    expect(AutoClosingPairs.shouldAutoDeletePair('`', '`')).toBe(true);

    // Mismatched
    expect(AutoClosingPairs.shouldAutoDeletePair('(', ']')).toBe(false);
    expect(AutoClosingPairs.shouldAutoDeletePair('a', 'b')).toBe(false);
  });

  it('detects surround selection when typing opening brackets', () => {
    expect(AutoClosingPairs.shouldSurround('(', 'hello')).toBe(')');
    expect(AutoClosingPairs.shouldSurround('[', 'item')).toBe(']');
    expect(AutoClosingPairs.shouldSurround('{', 'block')).toBe('}');
    expect(AutoClosingPairs.shouldSurround('"', 'text')).toBe('"');
    expect(AutoClosingPairs.shouldSurround("'", 'text')).toBe("'");
    expect(AutoClosingPairs.shouldSurround('`', 'code')).toBe('`');

    // Non-open bracket
    expect(AutoClosingPairs.shouldSurround('x', 'hello')).toBe(null);
    expect(AutoClosingPairs.shouldSurround('(', '')).toBe(null);
  });
});
