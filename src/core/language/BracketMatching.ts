/**
 * Mythic Editor - Bracket Matching Subsystem
 *
 * Faithfully adapted from Microsoft Monaco Editor / VS Code source (MIT License)
 * Reference: vs/editor/contrib/bracketMatching/browser/bracketMatching.ts
 * Reference: vs/editor/common/model/bracketPairsTextModelPart/bracketPairsImpl.ts
 *
 * Implements high-performance bracket pair matching, search depth scanning across lines,
 * smart cursor detection (immediately before or after bracket), and enclosing brackets
 * resolution for blocks when cursor is between brackets (e.g. after pressing Enter).
 */

import { ITextBuffer } from '../buffer/ITextBuffer';
import { Position } from '../model/Position';
import { Range } from '../model/Range';
import { CharacterPair } from './languageConfiguration';

export interface BracketMatch {
  readonly open: Range;
  readonly close: Range;
}

export interface IBracketSearchTokenProvider {
  getLineTokens(lineNumber: number): Array<{ startIndex: number; endIndex: number; type: string }> | undefined;
}

export class BracketMatching {
  public static readonly DEFAULT_BRACKETS: CharacterPair[] = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}']
  ];

  /**
   * Checks whether a character at the specified 0-based column index is inside a string or comment.
   */
  public static isIgnoredToken(
    lineNumber: number,
    charOffset: number,
    tokensProvider?: IBracketSearchTokenProvider
  ): boolean {
    if (!tokensProvider) {
      return false;
    }
    const tokens = tokensProvider.getLineTokens(lineNumber);
    if (!tokens || tokens.length === 0) {
      return false;
    }
    for (const tok of tokens) {
      if (charOffset >= tok.startIndex && charOffset < tok.endIndex) {
        const type = (tok.type || '').toLowerCase();
        if (
          type === 'comment' ||
          type.startsWith('comment') ||
          type === 'string' ||
          type.startsWith('string')
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Find matching bracket pair given the current cursor position.
   * Checks character under cursor first (col - 1), then character immediately before cursor (col - 2).
   */
  public static matchBracket(
    buffer: ITextBuffer,
    position: Position,
    brackets: CharacterPair[] = BracketMatching.DEFAULT_BRACKETS,
    tokensProvider?: IBracketSearchTokenProvider,
    maxLinesScan: number = 2000
  ): BracketMatch | null {
    const lineCount = buffer.getLineCount();
    if (position.lineNumber < 1 || position.lineNumber > lineCount) {
      return null;
    }

    const line = buffer.getLineContent(position.lineNumber);
    const col = position.column; // 1-based

    // Candidates to test:
    // 1. Character under cursor: index = col - 1
    // 2. Character immediately before cursor: index = col - 2
    const candidates: number[] = [];
    if (col - 1 >= 0 && col - 1 < line.length) {
      candidates.push(col - 1);
    }
    if (col - 2 >= 0 && col - 2 < line.length) {
      candidates.push(col - 2);
    }

    for (const charIdx of candidates) {
      if (this.isIgnoredToken(position.lineNumber, charIdx, tokensProvider)) {
        continue;
      }

      for (const [open, close] of brackets) {
        if (line.startsWith(open, charIdx)) {
          const match = this.findMatchingClosing(
            buffer,
            position.lineNumber,
            charIdx,
            open,
            close,
            tokensProvider,
            maxLinesScan
          );
          if (match) {
            return {
              open: new Range(position.lineNumber, charIdx + 1, position.lineNumber, charIdx + 1 + open.length),
              close: new Range(match.lineNumber, match.column, match.lineNumber, match.column + close.length)
            };
          }
        } else if (line.startsWith(close, charIdx)) {
          const match = this.findMatchingOpening(
            buffer,
            position.lineNumber,
            charIdx,
            open,
            close,
            tokensProvider,
            maxLinesScan
          );
          if (match) {
            return {
              open: new Range(match.lineNumber, match.column, match.lineNumber, match.column + open.length),
              close: new Range(position.lineNumber, charIdx + 1, position.lineNumber, charIdx + 1 + close.length)
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Find enclosing brackets for the current cursor position.
   * Useful when cursor is inside a block (e.g. after pressing Enter between brackets).
   * Faithfully ported from Monaco / VS Code (vs/editor/common/model/bracketPairsTextModelPart/bracketPairsImpl.ts).
   */
  public static findEnclosingBrackets(
    buffer: ITextBuffer,
    position: Position,
    brackets: CharacterPair[] = BracketMatching.DEFAULT_BRACKETS,
    tokensProvider?: IBracketSearchTokenProvider,
    maxLinesScan: number = 2000
  ): BracketMatch | null {
    const lineCount = buffer.getLineCount();
    if (position.lineNumber < 1 || position.lineNumber > lineCount) {
      return null;
    }

    const counts = new Map<string, number>();
    for (const [open] of brackets) {
      counts.set(open, 0);
    }

    const endLine = Math.min(lineCount, position.lineNumber + maxLinesScan);

    for (let l = position.lineNumber; l <= endLine; l++) {
      const lineText = buffer.getLineContent(l);
      const startIdx = (l === position.lineNumber) ? Math.max(0, position.column - 1) : 0;

      for (let i = startIdx; i < lineText.length; i++) {
        if (this.isIgnoredToken(l, i, tokensProvider)) {
          continue;
        }

        for (const [open, close] of brackets) {
          if (lineText.startsWith(open, i)) {
            counts.set(open, (counts.get(open) || 0) + 1);
            i += open.length - 1;
            break;
          } else if (lineText.startsWith(close, i)) {
            const currentCount = counts.get(open) || 0;
            if (currentCount > 0) {
              counts.set(open, currentCount - 1);
            } else {
              // Found unmatched closing bracket forward! Search backwards for matching opening bracket.
              const openPos = this.findMatchingOpening(
                buffer,
                l,
                i,
                open,
                close,
                tokensProvider,
                maxLinesScan
              );
              if (openPos && openPos.isBeforeOrEqual(position)) {
                return {
                  open: new Range(openPos.lineNumber, openPos.column, openPos.lineNumber, openPos.column + open.length),
                  close: new Range(l, i + 1, l, i + 1 + close.length)
                };
              }
            }
            i += close.length - 1;
            break;
          }
        }
      }
    }

    return null;
  }

  /**
   * Search forward for matching closing bracket.
   */
  public static findMatchingClosing(
    buffer: ITextBuffer,
    startLine: number,
    startCharIdx: number,
    open: string,
    close: string,
    tokensProvider?: IBracketSearchTokenProvider,
    maxLinesScan: number = 2000
  ): Position | null {
    let depth = 0;
    const lineCount = buffer.getLineCount();
    const endLine = Math.min(lineCount, startLine + maxLinesScan);

    for (let l = startLine; l <= endLine; l++) {
      const lineText = buffer.getLineContent(l);
      const startIdx = (l === startLine) ? startCharIdx : 0;

      for (let i = startIdx; i < lineText.length; i++) {
        if (this.isIgnoredToken(l, i, tokensProvider)) {
          continue;
        }

        if (lineText.startsWith(open, i)) {
          depth++;
          i += open.length - 1;
        } else if (lineText.startsWith(close, i)) {
          depth--;
          if (depth === 0) {
            return new Position(l, i + 1);
          }
          i += close.length - 1;
        }
      }
    }

    return null;
  }

  /**
   * Search backward for matching opening bracket.
   */
  public static findMatchingOpening(
    buffer: ITextBuffer,
    startLine: number,
    startCharIdx: number,
    open: string,
    close: string,
    tokensProvider?: IBracketSearchTokenProvider,
    maxLinesScan: number = 2000
  ): Position | null {
    let depth = 0;
    const endLine = Math.max(1, startLine - maxLinesScan);

    for (let l = startLine; l >= endLine; l--) {
      const lineText = buffer.getLineContent(l);
      const startIdx = (l === startLine) ? startCharIdx : lineText.length - 1;

      for (let i = startIdx; i >= 0; i--) {
        if (this.isIgnoredToken(l, i, tokensProvider)) {
          continue;
        }

        if (lineText.startsWith(close, i)) {
          depth++;
        } else if (lineText.startsWith(open, i)) {
          depth--;
          if (depth === 0) {
            return new Position(l, i + 1);
          }
        }
      }
    }

    return null;
  }
}
