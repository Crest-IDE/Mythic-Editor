/**
 * Mythic Editor - Language Configuration Interface
 *
 * Modeled after VS Code & Monaco Editor's languageConfiguration.ts
 * (/src/vs/editor/common/languages/languageConfiguration.ts)
 */

export type CharacterPair = [string, string];

export interface CommentRule {
  /**
   * The line comment token, like `//` or `#`.
   */
  lineComment?: string | null;

  /**
   * The block comment character pair, like `/* block comment *&#47;` or `<!-- comment -->`.
   */
  blockComment?: CharacterPair | null;
}

export interface IAutoClosingPair {
  open: string;
  close: string;
}

export interface IAutoClosingPairConditional extends IAutoClosingPair {
  notIn?: string[];
}

export interface IndentationRule {
  decreaseIndentPattern?: RegExp;
  increaseIndentPattern?: RegExp;
  indentNextLinePattern?: RegExp;
  unIndentedLinePattern?: RegExp;
}

export enum IndentAction {
  None = 0,
  Indent = 1,
  IndentOutdent = 2,
  Outdent = 3
}

export interface EnterAction {
  indentAction: IndentAction;
  appendText?: string;
  removeText?: number;
}

export interface OnEnterRule {
  beforeText: RegExp;
  afterText?: RegExp;
  previousLineText?: RegExp;
  action: EnterAction;
}

export interface IndentOptions {
  tabSize: number;
  insertSpaces: boolean;
}

export interface FoldingMarkers {
  start: RegExp;
  end: RegExp;
}

/**
 * Describes folding rules for a language.
 * Reference: vs/editor/common/languages/languageConfiguration.ts
 */
export interface FoldingRules {
  /**
   * Used by the indentation based strategy to decide whether empty lines belong to the previous or the next block.
   * If not set, `false` is used and empty lines belong to the previous block.
   */
  offSide?: boolean;
  markers?: FoldingMarkers;
}

/**
 * Defines the contract between language definitions and editor features
 * such as auto-closing pairs, comment toggling, brackets, and indentation.
 */
export interface LanguageConfiguration {
  id?: string;
  comments?: CommentRule;
  brackets?: CharacterPair[];
  autoClosingPairs?: IAutoClosingPairConditional[];
  surroundingPairs?: IAutoClosingPair[];
  indentation?: IndentOptions;
  indentationRules?: IndentationRule;
  onEnterRules?: OnEnterRule[];
  foldingRules?: FoldingRules;
  wordPattern?: RegExp;
  grammar?: string;
}
