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

  it('finds enclosing brackets when cursor is between brackets after pressing Enter (multiline)', () => {
    // Simulated buffer after pressing Enter between ():
    // Line 1: (
    // Line 2:     
    // Line 3: )
    const buffer = new PieceTreeTextBuffer('(\n    \n)', '\n');
    const cursorInside = new Position(2, 5); // on indented empty line

    // matchBracket returns null because line 2 has no brackets directly at cursor
    expect(BracketMatching.matchBracket(buffer, cursorInside)).toBeNull();

    // findEnclosingBrackets finds '(' on line 1 and ')' on line 3
    const enclosing = BracketMatching.findEnclosingBrackets(buffer, cursorInside);
    expect(enclosing).not.toBeNull();
    expect(enclosing?.open.startLineNumber).toBe(1);
    expect(enclosing?.open.startColumn).toBe(1);
    expect(enclosing?.close.startLineNumber).toBe(3);
    expect(enclosing?.close.startColumn).toBe(1);
  });

  it('finds enclosing braces for nested code blocks', () => {
    const text = 'function test() {\n  if (true) {\n    const x = 1;\n  }\n}';
    const buffer = new PieceTreeTextBuffer(text, '\n');

    // Cursor inside if-statement on line 3, col 10
    const innerPos = new Position(3, 10);
    const innerMatch = BracketMatching.findEnclosingBrackets(buffer, innerPos);
    expect(innerMatch).not.toBeNull();
    expect(innerMatch?.open.startLineNumber).toBe(2);
    expect(innerMatch?.close.startLineNumber).toBe(4);
  });

  it('finds enclosing brackets on the same line when cursor is separated by spaces', () => {
    const buffer = new PieceTreeTextBuffer('foo(   )', '\n');
    const pos = new Position(1, 6); // between '(' at col 4 and ')' at col 8
    expect(BracketMatching.matchBracket(buffer, pos)).toBeNull();

    const enclosing = BracketMatching.findEnclosingBrackets(buffer, pos);
    expect(enclosing).not.toBeNull();
    expect(enclosing?.open.startColumn).toBe(4);
    expect(enclosing?.close.startColumn).toBe(8);
  });

  describe('Invalid and Unmatched Bracket Detection (VS Code Compliant)', () => {
    it('returns empty array when all brackets are correctly balanced', () => {
      const buffer = new PieceTreeTextBuffer('function foo(a, b) { return [a, b]; }', '\n');
      const invalid = BracketMatching.getInvalidBrackets(buffer);
      expect(invalid).toEqual([]);
    });

    it('identifies unexpected closing bracket when closing bracket has no open bracket', () => {
      const buffer = new PieceTreeTextBuffer('const x = 1);', '\n');
      const invalid = BracketMatching.getInvalidBrackets(buffer);
      expect(invalid.length).toBe(1);
      expect(invalid[0].char).toBe(')');
      expect(invalid[0].type).toBe('unexpected-closing-bracket');
      expect(invalid[0].range.startLineNumber).toBe(1);
      expect(invalid[0].range.startColumn).toBe(12);
      expect(invalid[0].range.endColumn).toBe(13);
    });

    it('identifies unclosed opening bracket when closing bracket is missing', () => {
      const buffer = new PieceTreeTextBuffer('const x = (1 + 2;', '\n');
      const invalid = BracketMatching.getInvalidBrackets(buffer);
      expect(invalid.length).toBe(1);
      expect(invalid[0].char).toBe('(');
      expect(invalid[0].type).toBe('unclosed-opening-bracket');
      expect(invalid[0].range.startLineNumber).toBe(1);
      expect(invalid[0].range.startColumn).toBe(11);
      expect(invalid[0].range.endColumn).toBe(12);
    });

    it('identifies remaining bracket as invalid when one bracket is removed from () pair', () => {
      // User typed "()", then deleted ')' -> "(" is left
      const bufferWithoutCloser = new PieceTreeTextBuffer('foo(', '\n');
      const invalidOpener = BracketMatching.getInvalidBrackets(bufferWithoutCloser);
      expect(invalidOpener.length).toBe(1);
      expect(invalidOpener[0].char).toBe('(');
      expect(invalidOpener[0].type).toBe('unclosed-opening-bracket');

      // User typed "()", then deleted '(' -> ")" is left
      const bufferWithoutOpener = new PieceTreeTextBuffer('foo)', '\n');
      const invalidCloser = BracketMatching.getInvalidBrackets(bufferWithoutOpener);
      expect(invalidCloser.length).toBe(1);
      expect(invalidCloser[0].char).toBe(')');
      expect(invalidCloser[0].type).toBe('unexpected-closing-bracket');
    });

    it('identifies mismatched closing bracket within a pair', () => {
      const buffer = new PieceTreeTextBuffer('const arr = [ 1, 2 );', '\n');
      const invalid = BracketMatching.getInvalidBrackets(buffer);
      // Both the unexpected closer ')' and the unclosed '[' are invalid
      expect(invalid.some(b => b.char === ')' && b.type === 'unexpected-closing-bracket')).toBe(true);
      expect(invalid.some(b => b.char === '[' && b.type === 'unclosed-opening-bracket')).toBe(true);
    });

    it('identifies interleaved invalid brackets ( [ ) ]', () => {
      const buffer = new PieceTreeTextBuffer('([)]', '\n');
      const invalid = BracketMatching.getInvalidBrackets(buffer);
      // In VS Code parser: '[' and ']' are flagged invalid because '(' matches ')'
      expect(invalid.length).toBe(2);
      expect(invalid.some(b => b.char === '[')).toBe(true);
      expect(invalid.some(b => b.char === ']')).toBe(true);
    });

    it('detects multiple multiline unclosed brackets', () => {
      const text = 'function test() {\n  if (true) {\n    const x = 1;\n';
      const buffer = new PieceTreeTextBuffer(text, '\n');
      const invalid = BracketMatching.getInvalidBrackets(buffer);
      // Two open curly braces left unclosed
      expect(invalid.length).toBe(2);
      expect(invalid[0].char).toBe('{');
      expect(invalid[0].range.startLineNumber).toBe(1);
      expect(invalid[1].char).toBe('{');
      expect(invalid[1].range.startLineNumber).toBe(2);
    });

    it('ignores unmatched bracket characters in comments or strings', () => {
      const text = '// unmatched bracket in comment: )\nconst str = "unmatched (";\nconst val = 42;';
      const buffer = new PieceTreeTextBuffer(text, '\n');
      const mockTokensProvider: IBracketSearchTokenProvider = {
        getLineTokens(lineNumber: number) {
          if (lineNumber === 1) {
            return [{ startIndex: 0, endIndex: 35, type: 'comment' }];
          }
          if (lineNumber === 2) {
            return [
              { startIndex: 0, endIndex: 11, type: 'keyword' },
              { startIndex: 12, endIndex: 26, type: 'string' }
            ];
          }
          return [];
        }
      };

      const invalid = BracketMatching.getInvalidBrackets(buffer, undefined, mockTokensProvider);
      expect(invalid).toEqual([]);
    });
  });
});
