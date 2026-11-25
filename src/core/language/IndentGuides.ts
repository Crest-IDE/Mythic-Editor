/**
 * Mythic Editor - Indent Guides Core Algorithm
 *
 * Faithfully ported from Microsoft Monaco Editor / VS Code source (MIT License)
 * Reference:
 * - vs/editor/common/model/utils.ts (computeIndentLevel)
 * - vs/editor/common/textModelGuides.ts (IActiveIndentGuideInfo)
 * - vs/editor/common/model/guidesTextModelPart.ts (GuidesTextModelPart)
 *
 * Computes per-line indentation guide counts (including whitespace/blank lines with
 * brace vs off-side language folding rules) and the active indentation guide block
 * containing the cursor.
 */

import { ITextBuffer } from '../buffer/ITextBuffer';

const CHAR_CODE_TAB = 9;
const CHAR_CODE_SPACE = 32;
const MAX_ACTIVE_INDENT_SEARCH_DISTANCE = 50000;

export interface IActiveIndentGuideInfo {
  startLineNumber: number;
  endLineNumber: number;
  indent: number;
}

export interface IIndentGuidesComputeOptions {
  tabSize: number;
  indentSize?: number;
  offSide?: boolean;
}

interface IResolvedContentLine {
  index: number;
  indent: number;
}

/**
 * Returns:
 * - `-1` => the line consists solely of whitespace (or is empty)
 * - `>= 0` => the visual indent column count (accounting for tab stops)
 */
export function computeIndentLevel(line: string, tabSize: number): number {
  const safeTabSize = Math.max(1, tabSize);
  let indent = 0;
  let i = 0;
  const len = line.length;

  while (i < len) {
    const chCode = line.charCodeAt(i);
    if (chCode === CHAR_CODE_SPACE) {
      indent++;
    } else if (chCode === CHAR_CODE_TAB) {
      indent = indent - (indent % safeTabSize) + safeTabSize;
    } else {
      break;
    }
    i++;
  }

  if (i === len) {
    return -1; // line only consists of whitespace
  }

  return indent;
}

function findPreviousContentLine(
  buffer: ITextBuffer,
  startLineIndex: number,
  tabSize: number
): IResolvedContentLine {
  for (let lineIndex = startLineIndex; lineIndex >= 0; lineIndex--) {
    const indent = computeIndentLevel(buffer.getLineContent(lineIndex + 1), tabSize);
    if (indent >= 0) {
      return { index: lineIndex, indent };
    }
  }
  return { index: -1, indent: -1 };
}

function findNextContentLine(
  buffer: ITextBuffer,
  startLineIndex: number,
  lineCount: number,
  tabSize: number
): IResolvedContentLine {
  for (let lineIndex = startLineIndex; lineIndex < lineCount; lineIndex++) {
    const indent = computeIndentLevel(buffer.getLineContent(lineIndex + 1), tabSize);
    if (indent >= 0) {
      return { index: lineIndex, indent };
    }
  }
  return { index: -1, indent: -1 };
}

export class IndentGuides {
  /**
   * Computes the indent guide level for a whitespace-only line given the nearest
   * non-whitespace lines above and below it.
   */
  public static getIndentLevelForWhitespaceLine(
    offSide: boolean,
    aboveContentLineIndent: number,
    belowContentLineIndent: number,
    indentSize: number
  ): number {
    const safeIndentSize = Math.max(1, indentSize);

    if (aboveContentLineIndent === -1 || belowContentLineIndent === -1) {
      // At the top or bottom of the file
      return 0;
    } else if (aboveContentLineIndent < belowContentLineIndent) {
      // We are inside the region above
      return 1 + Math.floor(aboveContentLineIndent / safeIndentSize);
    } else if (aboveContentLineIndent === belowContentLineIndent) {
      // We are in between two regions
      return Math.ceil(belowContentLineIndent / safeIndentSize);
    } else {
      if (offSide) {
        // Same level as region below
        return Math.ceil(belowContentLineIndent / safeIndentSize);
      } else {
        // We are inside the region that ends below
        return 1 + Math.floor(belowContentLineIndent / safeIndentSize);
      }
    }
  }

  /**
   * Computes the number of vertical indent guides for each line in [startLineNumber, endLineNumber].
   */
  public static getLinesIndentGuides(
    buffer: ITextBuffer,
    startLineNumber: number,
    endLineNumber: number,
    options: IIndentGuidesComputeOptions
  ): number[] {
    const lineCount = buffer.getLineCount();

    if (startLineNumber < 1 || startLineNumber > lineCount) {
      throw new Error('Illegal value for startLineNumber');
    }
    if (endLineNumber < 1 || endLineNumber > lineCount) {
      throw new Error('Illegal value for endLineNumber');
    }

    const tabSize = Math.max(1, options.tabSize);
    const indentSize = Math.max(1, options.indentSize ?? tabSize);
    const offSide = Boolean(options.offSide);

    const result: number[] = new Array<number>(endLineNumber - startLineNumber + 1);

    let aboveContentLineIndex = -2; // -2 is a marker for not having computed it
    let aboveContentLineIndent = -1;

    let belowContentLineIndex = -2; // -2 is a marker for not having computed it
    let belowContentLineIndent = -1;

    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const resultIndex = lineNumber - startLineNumber;
      const currentIndent = computeIndentLevel(buffer.getLineContent(lineNumber), tabSize);

      if (currentIndent >= 0) {
        // This line has content (besides whitespace): use the line's indent
        aboveContentLineIndex = lineNumber - 1;
        aboveContentLineIndent = currentIndent;
        result[resultIndex] = Math.ceil(currentIndent / indentSize);
        continue;
      }

      if (aboveContentLineIndex === -2) {
        const resolved = findPreviousContentLine(buffer, lineNumber - 2, tabSize);
        aboveContentLineIndex = resolved.index;
        aboveContentLineIndent = resolved.indent;
      }

      if (belowContentLineIndex !== -1 && (belowContentLineIndex === -2 || belowContentLineIndex < lineNumber - 1)) {
        const resolved = findNextContentLine(buffer, lineNumber, lineCount, tabSize);
        belowContentLineIndex = resolved.index;
        belowContentLineIndent = resolved.indent;
      }

      result[resultIndex] = IndentGuides.getIndentLevelForWhitespaceLine(
        offSide,
        aboveContentLineIndent,
        belowContentLineIndent,
        indentSize
      );
    }

    return result;
  }

  /**
   * Computes the active indent guide range and level for the block containing `lineNumber`,
   * bounded by [minLineNumber, maxLineNumber].
   */
  public static getActiveIndentGuide(
    buffer: ITextBuffer,
    lineNumber: number,
    minLineNumber: number,
    maxLineNumber: number,
    options: IIndentGuidesComputeOptions
  ): IActiveIndentGuideInfo {
    const lineCount = buffer.getLineCount();

    if (lineNumber < 1 || lineNumber > lineCount) {
      throw new Error('Illegal value for lineNumber');
    }

    const tabSize = Math.max(1, options.tabSize);
    const indentSize = Math.max(1, options.indentSize ?? tabSize);
    const offSide = Boolean(options.offSide);

    let upAboveContentLineIndex = -2;
    let upAboveContentLineIndent = -1;
    let upBelowContentLineIndex = -2;
    let upBelowContentLineIndent = -1;

    const upResolveIndents = (targetLineNumber: number) => {
      if (upAboveContentLineIndex !== -1 && (upAboveContentLineIndex === -2 || upAboveContentLineIndex > targetLineNumber - 1)) {
        const resolved = findPreviousContentLine(buffer, targetLineNumber - 2, tabSize);
        upAboveContentLineIndex = resolved.index;
        upAboveContentLineIndent = resolved.indent;
      }

      if (upBelowContentLineIndex === -2) {
        const resolved = findNextContentLine(buffer, targetLineNumber, lineCount, tabSize);
        upBelowContentLineIndex = resolved.index;
        upBelowContentLineIndent = resolved.indent;
      }
    };

    let downAboveContentLineIndex = -2;
    let downAboveContentLineIndent = -1;
    let downBelowContentLineIndex = -2;
    let downBelowContentLineIndent = -1;

    const downResolveIndents = (targetLineNumber: number) => {
      if (downAboveContentLineIndex === -2) {
        const resolved = findPreviousContentLine(buffer, targetLineNumber - 2, tabSize);
        downAboveContentLineIndex = resolved.index;
        downAboveContentLineIndent = resolved.indent;
      }

      if (downBelowContentLineIndex !== -1 && (downBelowContentLineIndex === -2 || downBelowContentLineIndex < targetLineNumber - 1)) {
        const resolved = findNextContentLine(buffer, targetLineNumber, lineCount, tabSize);
        downBelowContentLineIndex = resolved.index;
        downBelowContentLineIndent = resolved.indent;
      }
    };

    let startLineNumber = 0;
    let goUp = true;
    let endLineNumber = 0;
    let goDown = true;
    let indent = 0;
    let initialIndent = 0;

    for (let distance = 0; goUp || goDown; distance++) {
      const upLineNumber = lineNumber - distance;
      const downLineNumber = lineNumber + distance;

      if (distance > 1 && (upLineNumber < 1 || upLineNumber < minLineNumber)) {
        goUp = false;
      }
      if (distance > 1 && (downLineNumber > lineCount || downLineNumber > maxLineNumber)) {
        goDown = false;
      }
      if (distance > MAX_ACTIVE_INDENT_SEARCH_DISTANCE) {
        goUp = false;
        goDown = false;
      }

      let upLineIndentLevel = -1;
      if (goUp && upLineNumber >= 1) {
        const currentIndent = computeIndentLevel(buffer.getLineContent(upLineNumber), tabSize);
        if (currentIndent >= 0) {
          upBelowContentLineIndex = upLineNumber - 1;
          upBelowContentLineIndent = currentIndent;
          upLineIndentLevel = Math.ceil(currentIndent / indentSize);
        } else {
          upResolveIndents(upLineNumber);
          upLineIndentLevel = IndentGuides.getIndentLevelForWhitespaceLine(
            offSide,
            upAboveContentLineIndent,
            upBelowContentLineIndent,
            indentSize
          );
        }
      }

      let downLineIndentLevel = -1;
      if (goDown && downLineNumber <= lineCount) {
        const currentIndent = computeIndentLevel(buffer.getLineContent(downLineNumber), tabSize);
        if (currentIndent >= 0) {
          downAboveContentLineIndex = downLineNumber - 1;
          downAboveContentLineIndent = currentIndent;
          downLineIndentLevel = Math.ceil(currentIndent / indentSize);
        } else {
          downResolveIndents(downLineNumber);
          downLineIndentLevel = IndentGuides.getIndentLevelForWhitespaceLine(
            offSide,
            downAboveContentLineIndent,
            downBelowContentLineIndent,
            indentSize
          );
        }
      }

      if (distance === 0) {
        initialIndent = upLineIndentLevel;
        continue;
      }

      if (distance === 1) {
        if (downLineNumber <= lineCount && downLineIndentLevel >= 0 && initialIndent + 1 === downLineIndentLevel) {
          // Beginning of a scope: make the child scope indent active instead of parent
          goUp = false;
          startLineNumber = downLineNumber;
          endLineNumber = downLineNumber;
          indent = downLineIndentLevel;
          continue;
        }

        if (upLineNumber >= 1 && upLineIndentLevel >= 0 && upLineIndentLevel - 1 === initialIndent) {
          // End of a scope: highlight the enclosed scope above
          goDown = false;
          startLineNumber = upLineNumber;
          endLineNumber = upLineNumber;
          indent = upLineIndentLevel;
          continue;
        }

        startLineNumber = lineNumber;
        endLineNumber = lineNumber;
        indent = initialIndent;
        if (indent === 0) {
          return { startLineNumber, endLineNumber, indent };
        }
      }

      if (goUp) {
        if (upLineIndentLevel >= indent) {
          startLineNumber = upLineNumber;
        } else {
          goUp = false;
        }
      }
      if (goDown) {
        if (downLineIndentLevel >= indent) {
          endLineNumber = downLineNumber;
        } else {
          goDown = false;
        }
      }
    }

    return { startLineNumber, endLineNumber, indent };
  }
}
