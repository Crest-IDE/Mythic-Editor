import { describe, it, expect } from 'vitest';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { Position } from '@mythic/core/model/Position';
import { BracketMatching, IBracketSearchTokenProvider } from '@mythic/core/language/BracketMatching';

describe('BracketMatching Core Subsystem', () => {
  it('matches single-line parentheses when cursor is right before open bracket', () => {
    const buffer = new PieceTreeTextBuffer('const x = (a + b);', '\n');
    // Position of '(' is line 1, column 11
    const pos = new Position(1, 11);
    const match = BracketMatching.matchBracket(buffer, pos);

    expect(match).not.toBeNull();
    expect(match?.open.startLineNumber).toBe(1);
    expect(match?.open.startColumn).toBe(11);
    expect(match?.open.endColumn).toBe(12);

    expect(match?.close.startLineNumber).toBe(1);
    expect(match?.close.startColumn).toBe(17);
    expect(match?.close.endColumn).toBe(18);
  });

  it('matches single-line parentheses when cursor is right after open bracket', () => {
    const buffer = new PieceTreeTextBuffer('const x = (a + b);', '\n');
    // Position immediately after '(' is column 12
    const pos = new Position(1, 12);
    const match = BracketMatching.matchBracket(buffer, pos);

    expect(match).not.toBeNull();
    expect(match?.open.startColumn).toBe(11);
    expect(match?.close.startColumn).toBe(17);
  });

  it('matches single-line parentheses when cursor is right before close bracket', () => {
    const buffer = new PieceTreeTextBuffer('const x = (a + b);', '\n');
    // Position immediately before ')' is column 17
    const pos = new Position(1, 17);
    const match = BracketMatching.matchBracket(buffer, pos);

    expect(match).not.toBeNull();
    expect(match?.open.startColumn).toBe(11);
    expect(match?.close.startColumn).toBe(17);
  });

  it('matches single-line parentheses when cursor is right after close bracket', () => {
    const buffer = new PieceTreeTextBuffer('const x = (a + b);', '\n');
    // Position immediately after ')' is column 18
    const pos = new Position(1, 18);
    const match = BracketMatching.matchBracket(buffer, pos);

    expect(match).not.toBeNull();
    expect(match?.open.startColumn).toBe(11);
    expect(match?.close.startColumn).toBe(17);
  });

  it('returns null when cursor is not at or near a bracket', () => {
    const buffer = new PieceTreeTextBuffer('const x = (a + b);', '\n');
    // Column 5 is 't' in 'const'
    const pos = new Position(1, 5);
    const match = BracketMatching.matchBracket(buffer, pos);
    expect(match).toBeNull();
  });

  it('correctly matches nested brackets at different depths', () => {
    //                                      12345678901234567890
    const buffer = new PieceTreeTextBuffer('fn((a + [b * c]) + d)', '\n');
    // Inner square bracket '[' at col 9
    const innerBracketPos = new Position(1, 9);
    const innerMatch = BracketMatching.matchBracket(buffer, innerBracketPos);
    expect(innerMatch).not.toBeNull();
    expect(innerMatch?.open.startColumn).toBe(9);
    expect(innerMatch?.close.startColumn).toBe(15); // ']' at col 15

    // Outer parenthesis '(' at col 3
    const outerParenPos = new Position(1, 3);
    const outerMatch = BracketMatching.matchBracket(buffer, outerParenPos);
    expect(outerMatch).not.toBeNull();
    expect(outerMatch?.open.startColumn).toBe(3);
    expect(outerMatch?.close.startColumn).toBe(21); // outer ')'
  });

  it('matches multiline brackets across multiple lines', () => {
    const text = 'function hello() {\n  if (true) {\n    return 42;\n  }\n}';
    const buffer = new PieceTreeTextBuffer(text, '\n');

    // Outer curly brace '{' at line 1, col 18
    const pos = new Position(1, 18);
    const match = BracketMatching.matchBracket(buffer, pos);

    expect(match).not.toBeNull();
    expect(match?.open.startLineNumber).toBe(1);
    expect(match?.open.startColumn).toBe(18);

    expect(match?.close.startLineNumber).toBe(5);
    expect(match?.close.startColumn).toBe(1);
  });

  it('ignores brackets inside strings or comments when tokensProvider is provided', () => {
    const text = 'const msg = "(not bracket)";\nconst real = (42);';
    const buffer = new PieceTreeTextBuffer(text, '\n');

    const mockTokensProvider: IBracketSearchTokenProvider = {
      getLineTokens(lineNumber: number) {
        if (lineNumber === 1) {
          return [
            { startIndex: 0, endIndex: 11, type: 'keyword' },
            { startIndex: 12, endIndex: 27, type: 'string' }
          ];
        }
        return [];
      }
    };

    // Cursor at '(' inside the string on line 1, col 14
    const stringPos = new Position(1, 14);
    const matchInString = BracketMatching.matchBracket(buffer, stringPos, undefined, mockTokensProvider);
    expect(matchInString).toBeNull();

    // Cursor at real '(' on line 2, col 14
    const realPos = new Position(2, 14);
    const matchReal = BracketMatching.matchBracket(buffer, realPos, undefined, mockTokensProvider);
    expect(matchReal).not.toBeNull();
    expect(matchReal?.open.startLineNumber).toBe(2);
    expect(matchReal?.close.startLineNumber).toBe(2);
    expect(matchReal?.close.startColumn).toBe(17);
  });

  it('returns null for unmatched open bracket', () => {
    const buffer = new PieceTreeTextBuffer('const unclosed = (1 + 2;', '\n');
    const pos = new Position(1, 18); // '('
    const match = BracketMatching.matchBracket(buffer, pos);
    expect(match).toBeNull();
  });
});
