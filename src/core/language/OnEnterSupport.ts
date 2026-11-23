/**
 * Mythic Editor - On-Enter & Auto-Indentation Support
 *
 * Modeled after Microsoft VS Code's onEnter.ts & indentRules.ts
 * (/src/vs/editor/common/languages/supports/onEnter.ts)
 *
 * Implements high-speed bracket splitting (IndentOutdent), block statement indenting,
 * RegEx-based OnEnter rules, and indent preservation.
 */

import {
  LanguageConfiguration,
  IndentAction,
  CharacterPair
} from './languageConfiguration';

export interface IOnEnterResult {
  textToInsert: string;
  deleteCount: number;
  deleteBeforeCount: number;
  cursorOffset: number;
}

export class OnEnterSupport {
  /**
   * Determine the indentation and text modifications when Enter is pressed.
   *
   * @param beforeText Text on current line up to the cursor.
   * @param afterText Text on current line from the cursor to line end.
   * @param config Language configuration containing brackets, indentationRules, onEnterRules, etc.
   * @param previousLineText Optional text of the line preceding current line.
   */
  static getEnterResult(
    beforeText: string,
    afterText: string,
    config: LanguageConfiguration,
    previousLineText?: string
  ): IOnEnterResult {
    const tabSize = config.indentation?.tabSize || 4;
    const insertSpaces = config.indentation?.insertSpaces !== false;
    const oneIndent = insertSpaces ? ' '.repeat(tabSize) : '\t';

    // 1. Extract base indentation from beforeText
    const baseMatch = beforeText.match(/^[\t ]*/);
    const baseIndent = baseMatch ? baseMatch[0] : '';

    const trimmedBefore = beforeText.trimEnd();
    const leadingAfterMatch = afterText.match(/^[\t ]*/);
    const leadingAfter = leadingAfterMatch ? leadingAfterMatch[0] : '';
    const trimmedAfter = afterText.slice(leadingAfter.length);

    // 2. Bracket Matching (Between-Brackets Split -> IndentAction.IndentOutdent)
    // E.g. { | } or ( | ) or [ | ]
    const brackets: CharacterPair[] = config.brackets || [
      ['(', ')'],
      ['[', ']'],
      ['{', '}']
    ];

    for (const [open, close] of brackets) {
      if (trimmedBefore.endsWith(open) && trimmedAfter.startsWith(close)) {
        const trailingBeforeCount = beforeText.length - trimmedBefore.length;
        const deleteCount = leadingAfter.length;
        const indentedLine = baseIndent + oneIndent;
        // Text inserted: '\n' + indentedLine + '\n' + baseIndent
        // Replaces any extra whitespace between brackets
        const textToInsert = '\n' + indentedLine + '\n' + baseIndent;
        return {
          textToInsert,
          deleteBeforeCount: trailingBeforeCount,
          deleteCount,
          cursorOffset: 1 + indentedLine.length
        };
      }
    }

    // 3. User-defined OnEnterRules (e.g. JSDoc '/**' or comments)
    if (config.onEnterRules && config.onEnterRules.length > 0) {
      for (const rule of config.onEnterRules) {
        if (rule.beforeText.test(beforeText)) {
          if (!rule.afterText || rule.afterText.test(afterText)) {
            if (!rule.previousLineText || (previousLineText && rule.previousLineText.test(previousLineText))) {
              const appendText = rule.action.appendText || '';
              const removeText = rule.action.removeText || 0;

              let effectiveBase = baseIndent;
              if (removeText > 0 && effectiveBase.length >= removeText) {
                effectiveBase = effectiveBase.slice(0, effectiveBase.length - removeText);
              }

              switch (rule.action.indentAction) {
                case IndentAction.Indent: {
                  const targetIndent = effectiveBase + oneIndent;
                  const textToInsert = '\n' + targetIndent + appendText;
                  return {
                    textToInsert,
                    deleteBeforeCount: 0,
                    deleteCount: 0,
                    cursorOffset: textToInsert.length
                  };
                }
                case IndentAction.IndentOutdent: {
                  const indented = rule.action.appendText ? effectiveBase : (effectiveBase + oneIndent);
                  const textToInsert = '\n' + indented + appendText + '\n' + effectiveBase;
                  return {
                    textToInsert,
                    deleteBeforeCount: 0,
                    deleteCount: leadingAfter.length,
                    cursorOffset: 1 + indented.length + appendText.length
                  };
                }
                case IndentAction.Outdent: {
                  const outdented = OnEnterSupport.outdent(effectiveBase, oneIndent, tabSize);
                  const textToInsert = '\n' + outdented + appendText;
                  return {
                    textToInsert,
                    deleteBeforeCount: 0,
                    deleteCount: 0,
                    cursorOffset: textToInsert.length
                  };
                }
                case IndentAction.None:
                default: {
                  const textToInsert = '\n' + effectiveBase + appendText;
                  return {
                    textToInsert,
                    deleteBeforeCount: 0,
                    deleteCount: 0,
                    cursorOffset: textToInsert.length
                  };
                }
              }
            }
          }
        }
      }
    }

    // 4. IndentationRules: increaseIndentPattern
    // E.g. JS/TS `{`, `(`, `[` or Python `:`
    const increasePattern = config.indentationRules?.increaseIndentPattern;
    const shouldIncrease = increasePattern
      ? increasePattern.test(beforeText)
      : brackets.some(([open]) => trimmedBefore.endsWith(open));

    if (shouldIncrease) {
      const targetIndent = baseIndent + oneIndent;
      const textToInsert = '\n' + targetIndent;
      return {
        textToInsert,
        deleteBeforeCount: 0,
        deleteCount: 0,
        cursorOffset: textToInsert.length
      };
    }

    // 5. IndentationRules: decreaseIndentPattern on afterText
    const decreasePattern = config.indentationRules?.decreaseIndentPattern;
    if (decreasePattern && decreasePattern.test(afterText) && trimmedBefore.length === 0) {
      const outdented = OnEnterSupport.outdent(baseIndent, oneIndent, tabSize);
      const textToInsert = '\n' + outdented;
      return {
        textToInsert,
        deleteBeforeCount: 0,
        deleteCount: 0,
        cursorOffset: textToInsert.length
      };
    }

    // 6. Default: Copy/Preserve current line's leading indentation
    const textToInsert = '\n' + baseIndent;
    return {
      textToInsert,
      deleteBeforeCount: 0,
      deleteCount: 0,
      cursorOffset: textToInsert.length
    };
  }

  /**
   * Helper to reduce one indentation level from a given whitespace prefix.
   */
  static outdent(indent: string, oneIndent: string, tabSize: number): string {
    if (indent.endsWith(oneIndent)) {
      return indent.slice(0, indent.length - oneIndent.length);
    }
    if (indent.endsWith('\t')) {
      return indent.slice(0, -1);
    }
    const spaceMatch = indent.match(/ +$/);
    if (spaceMatch) {
      const spacesToRemove = Math.min(spaceMatch[0].length, tabSize);
      return indent.slice(0, indent.length - spacesToRemove);
    }
    return indent;
  }
}
