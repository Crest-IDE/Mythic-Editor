/**
 * Mythic Editor - Indentation Guesser
 *
 * Faithfully ported from Microsoft Monaco Editor / VS Code source (MIT License)
 * Reference: vs/editor/common/model/indentationGuesser.ts
 *
 * Infers tabSize and insertSpaces from buffer contents when detectIndentation is enabled,
 * so indent guides and editing match the file's actual indentation style.
 */

import { ITextBuffer } from '../buffer/ITextBuffer';

const CHAR_CODE_TAB = 9;
const CHAR_CODE_SPACE = 32;
const CHAR_CODE_COMMA = 44;

class SpacesDiffResult {
  public spacesDiff: number = 0;
  public looksLikeAlignment: boolean = false;
}

/**
 * Compute the diff in spaces between two line's indentation.
 */
function spacesDiff(a: string, aLength: number, b: string, bLength: number, result: SpacesDiffResult): void {
  result.spacesDiff = 0;
  result.looksLikeAlignment = false;

  let i: number;
  for (i = 0; i < aLength && i < bLength; i++) {
    const aCharCode = a.charCodeAt(i);
    const bCharCode = b.charCodeAt(i);
    if (aCharCode !== bCharCode) {
      break;
    }
  }

  let aSpacesCnt = 0;
  let aTabsCount = 0;
  for (let j = i; j < aLength; j++) {
    if (a.charCodeAt(j) === CHAR_CODE_SPACE) {
      aSpacesCnt++;
    } else {
      aTabsCount++;
    }
  }

  let bSpacesCnt = 0;
  let bTabsCount = 0;
  for (let j = i; j < bLength; j++) {
    if (b.charCodeAt(j) === CHAR_CODE_SPACE) {
      bSpacesCnt++;
    } else {
      bTabsCount++;
    }
  }

  if (aSpacesCnt > 0 && aTabsCount > 0) {
    return;
  }
  if (bSpacesCnt > 0 && bTabsCount > 0) {
    return;
  }

  const tabsDiff = Math.abs(aTabsCount - bTabsCount);
  const spacesCountDiff = Math.abs(aSpacesCnt - bSpacesCnt);

  if (tabsDiff === 0) {
    // Check if the indentation difference might be caused by alignment reasons
    result.spacesDiff = spacesCountDiff;

    if (spacesCountDiff > 0 && 0 <= bSpacesCnt - 1 && bSpacesCnt - 1 < a.length && bSpacesCnt < b.length) {
      if (b.charCodeAt(bSpacesCnt) !== CHAR_CODE_SPACE && a.charCodeAt(bSpacesCnt - 1) === CHAR_CODE_SPACE) {
        if (a.charCodeAt(a.length - 1) === CHAR_CODE_COMMA) {
          result.looksLikeAlignment = true;
        }
      }
    }
    return;
  }

  if (spacesCountDiff % tabsDiff === 0) {
    result.spacesDiff = spacesCountDiff / tabsDiff;
  }
}

export interface IGuessedIndentation {
  /**
   * If indentation is based on spaces (`insertSpaces` = true), then what is the number of spaces that make an indent?
   */
  tabSize: number;
  /**
   * Is indentation based on spaces?
   */
  insertSpaces: boolean;
}

const ALLOWED_TAB_SIZE_GUESSES = [2, 4, 6, 8, 3, 5, 7];
const MAX_ALLOWED_TAB_SIZE_GUESS = 8;

/**
 * Guess indentation settings (tabSize and insertSpaces) by inspecting up to 10,000 lines of the buffer.
 */
export function guessIndentation(
  source: ITextBuffer,
  defaultTabSize: number,
  defaultInsertSpaces: boolean
): IGuessedIndentation {
  const linesCount = Math.min(source.getLineCount(), 10000);

  let linesIndentedWithTabsCount = 0;
  let linesIndentedWithSpacesCount = 0;

  let previousLineText = '';
  let previousLineIndentation = 0;

  const spacesDiffCount = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const tmp = new SpacesDiffResult();

  for (let lineNumber = 1; lineNumber <= linesCount; lineNumber++) {
    const currentLineText = source.getLineContent(lineNumber);
    const currentLineLength = currentLineText.length;

    let currentLineHasContent = false;
    let currentLineIndentation = 0;
    let currentLineSpacesCount = 0;
    let currentLineTabsCount = 0;

    for (let j = 0; j < currentLineLength; j++) {
      const charCode = currentLineText.charCodeAt(j);
      if (charCode === CHAR_CODE_TAB) {
        currentLineTabsCount++;
      } else if (charCode === CHAR_CODE_SPACE) {
        currentLineSpacesCount++;
      } else {
        currentLineHasContent = true;
        currentLineIndentation = j;
        break;
      }
    }

    if (!currentLineHasContent) {
      continue;
    }

    if (currentLineTabsCount > 0) {
      linesIndentedWithTabsCount++;
    } else if (currentLineSpacesCount > 1) {
      linesIndentedWithSpacesCount++;
    }

    spacesDiff(previousLineText, previousLineIndentation, currentLineText, currentLineIndentation, tmp);

    if (tmp.looksLikeAlignment) {
      if (!(defaultInsertSpaces && defaultTabSize === tmp.spacesDiff)) {
        continue;
      }
    }

    const currentSpacesDiff = tmp.spacesDiff;
    if (currentSpacesDiff <= MAX_ALLOWED_TAB_SIZE_GUESS) {
      spacesDiffCount[currentSpacesDiff]++;
    }

    previousLineText = currentLineText;
    previousLineIndentation = currentLineIndentation;
  }

  let insertSpaces = defaultInsertSpaces;
  if (linesIndentedWithTabsCount !== linesIndentedWithSpacesCount) {
    insertSpaces = linesIndentedWithTabsCount < linesIndentedWithSpacesCount;
  }

  let tabSize = defaultTabSize;

  if (insertSpaces) {
    let tabSizeScore = 0;
    for (const possibleTabSize of ALLOWED_TAB_SIZE_GUESSES) {
      const possibleTabSizeScore = spacesDiffCount[possibleTabSize];
      if (possibleTabSizeScore > tabSizeScore) {
        tabSizeScore = possibleTabSizeScore;
        tabSize = possibleTabSize;
      }
    }

    // Prefer 2 over 4 when 2 appears at least 2/3 as often as 4
    if (tabSize === 4 && spacesDiffCount[4] > 0 && spacesDiffCount[2] > 0 && spacesDiffCount[2] >= (spacesDiffCount[4] * 2) / 3) {
      tabSize = 2;
    }
  }

  return {
    insertSpaces,
    tabSize
  };
}
