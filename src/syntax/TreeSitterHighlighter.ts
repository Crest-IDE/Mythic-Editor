/**
 * Mythic Editor - Tree-sitter Syntax Highlighter
 *
 * Official web-tree-sitter WebAssembly integration for Mythic's ITextBuffer
 * and RenderedLinesCollection tokenization engine. Supports both SCM Queries
 * (Helix / Neovim style) and direct AST visitor fallback.
 */

import Parser from 'web-tree-sitter';
import { ITextBuffer } from '../core/buffer/ITextBuffer';
import { ILineToken, ILineTokensProvider } from '../view/RenderedLinesCollection';

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'default', 'break', 'continue', 'throw', 'try',
  'catch', 'finally', 'class', 'extends', 'import', 'export', 'from',
  'async', 'await', 'yield', 'new', 'typeof', 'instanceof', 'in', 'of',
  'debugger', 'def', 'elif', 'print', 'pass', 'lambda', 'with', 'as',
  'fn', 'pub', 'mut', 'impl', 'struct', 'enum', 'trait', 'match', 'use',
  'mod', 'type', 'interface', 'package', 'public', 'private', 'protected',
  'static', 'readonly', 'abstract', 'is', 'not', 'and', 'or'
]);

const OPERATORS = new Set([
  '+', '-', '*', '/', '%', '=', '+=', '-=', '*=', '/=', '==', '===', '!=', '!==',
  '<', '>', '<=', '>=', '&&', '||', '!', '?', ':', '=>', '&', '|', '^', '~', '<<', '>>',
  '**', '??', '||=', '&&=', '??='
]);

const PUNCTUATION = new Set(['(', ')', '{', '}', '[', ']', ';', ',', '.']);

export interface ITreeSitterInitOptions {
  locateFile?: (scriptName: string, scriptDirectory?: string) => string;
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.href) {
    const href = window.location.href;
    const idx = href.lastIndexOf('/');
    if (idx !== -1) {
      return href.substring(0, idx + 1);
    }
  }
  return './';
}

export class TreeSitterHighlighter implements ILineTokensProvider {
  private static isInitialized = false;
  private static initPromise: Promise<void> | null = null;
  private static loadedLanguages: Map<string, Parser.Language> = new Map();
  private static loadedQueries: Map<string, Parser.Query> = new Map();

  private currentLanguage: string;
  private parser: Parser | null = null;
  private tree: Parser.Tree | null = null;
  private lineTokensMap: Map<number, ILineToken[]> = new Map();

  constructor(language: string = 'javascript') {
    this.currentLanguage = language;
    if (TreeSitterHighlighter.isInitialized) {
      this.initParser(language);
    }
  }

  /**
   * Initialize the web-tree-sitter WebAssembly core.
   * Can be called once upfront or triggered automatically via ready().
   */
  static async init(options?: ITreeSitterInitOptions): Promise<void> {
    if (TreeSitterHighlighter.isInitialized) return;
    if (TreeSitterHighlighter.initPromise) return TreeSitterHighlighter.initPromise;

    TreeSitterHighlighter.initPromise = (async () => {
      const defaultLocate = (scriptName: string) => {
        if (typeof window !== 'undefined' || typeof document !== 'undefined') {
          return getBaseUrl() + scriptName;
        }
        return `./public/${scriptName}`;
      };

      await Parser.init({
        locateFile: options?.locateFile || defaultLocate
      });
      TreeSitterHighlighter.isInitialized = true;
    })();

    return TreeSitterHighlighter.initPromise;
  }

  /**
   * Load and register a language WASM grammar into the cache.
   * Also attempts to load matching highlights.scm query if available.
   */
  static async loadLanguage(
    name: string,
    wasmPathOrUrl?: string,
    scmPathOrUrl?: string
  ): Promise<Parser.Language | null> {
    await TreeSitterHighlighter.init();
    let lang = TreeSitterHighlighter.loadedLanguages.get(name);

    if (!lang) {
      const defaultPath = () => {
        const fileName = name.startsWith('tree-sitter-') ? `${name}.wasm` : `tree-sitter-${name}.wasm`;
        if (typeof window !== 'undefined' || typeof document !== 'undefined') {
          return getBaseUrl() + fileName;
        }
        return `./public/${fileName}`;
      };

      const target = wasmPathOrUrl || defaultPath();
      try {
        lang = await Parser.Language.load(target);
        TreeSitterHighlighter.loadedLanguages.set(name, lang);
      } catch (err) {
        console.warn(`[TreeSitterHighlighter] Failed to load language grammar '${name}' from ${target}:`, err);
        return null;
      }
    }

    // Attempt to load associated .scm queries (Helix / Neovim highlights)
    if (!TreeSitterHighlighter.loadedQueries.has(name) && lang) {
      await TreeSitterHighlighter.loadQuery(name, scmPathOrUrl);
    }

    return lang;
  }

  /**
   * Load and register an SCM query (e.g. highlights.scm) for a loaded language.
   */
  static async loadQuery(name: string, scmPathOrUrl?: string): Promise<Parser.Query | null> {
    const lang = TreeSitterHighlighter.loadedLanguages.get(name);
    if (!lang) return null;

    if (TreeSitterHighlighter.loadedQueries.has(name)) {
      return TreeSitterHighlighter.loadedQueries.get(name)!;
    }

    try {
      let scmText = '';
      if (typeof window !== 'undefined' || typeof document !== 'undefined') {
        const url = scmPathOrUrl || `${getBaseUrl()}queries/${name}.scm`;
        const res = await fetch(url);
        if (res.ok) {
          scmText = await res.text();
        }
      } else {
        // Node / Vitest environment
        try {
          const fsModuleName = 'fs';
          const fs = await import(/* @vite-ignore */ fsModuleName);
          const p = scmPathOrUrl || `./public/queries/${name}.scm`;
          if (fs.existsSync(p)) {
            scmText = fs.readFileSync(p, 'utf8');
          }
        } catch {
          // Fallback gracefully
        }
      }

      if (scmText) {
        const query = lang.query(scmText);
        TreeSitterHighlighter.loadedQueries.set(name, query);
        return query;
      }
    } catch {
      // If query fails to compile, we gracefully fall back to AST visitor
    }

    return null;
  }

  /**
   * Directly register an SCM query instance.
   */
  static registerQuery(name: string, query: Parser.Query): void {
    TreeSitterHighlighter.loadedQueries.set(name, query);
  }

  /**
   * Check if a language has already been loaded.
   */
  static hasLanguage(name: string): boolean {
    return TreeSitterHighlighter.loadedLanguages.has(name);
  }

  /**
   * Directly register an already-loaded Language instance.
   */
  static registerLanguage(name: string, language: Parser.Language): void {
    TreeSitterHighlighter.loadedLanguages.set(name, language);
  }

  /**
   * Async initialization for Browser & Android WebView environments where WASM
   * must be compiled and instantiated asynchronously.
   */
  async ready(wasmUrl?: string, scmUrl?: string): Promise<boolean> {
    try {
      await TreeSitterHighlighter.init();
      if (!TreeSitterHighlighter.hasLanguage(this.currentLanguage)) {
        await TreeSitterHighlighter.loadLanguage(this.currentLanguage, wasmUrl, scmUrl);
      }
      return this.initParser(this.currentLanguage);
    } catch {
      return false;
    }
  }

  /**
   * Factory method to construct and asynchronously initialize a highlighter.
   */
  static async create(language: string = 'javascript', wasmUrl?: string, scmUrl?: string): Promise<TreeSitterHighlighter> {
    const highlighter = new TreeSitterHighlighter(language);
    await highlighter.ready(wasmUrl, scmUrl);
    return highlighter;
  }

  /**
   * Set or switch active programming language (e.g. 'javascript', 'typescript', 'python').
   */
  setLanguage(language: string): boolean {
    if (this.currentLanguage !== language) {
      this.currentLanguage = language;
      this.tree = null;
    }
    return this.initParser(language);
  }

  getLanguage(): string {
    return this.currentLanguage;
  }

  /**
   * Initialize parser instance for the given language if loaded.
   */
  private initParser(language: string): boolean {
    const lang = TreeSitterHighlighter.loadedLanguages.get(language);
    if (!lang) {
      return false;
    }

    try {
      if (!this.parser) {
        this.parser = new Parser();
      }
      this.parser.setLanguage(lang);
      return true;
    } catch (err) {
      console.warn(`[TreeSitterHighlighter] setLanguage failed for '${language}':`, err);
      return false;
    }
  }

  /**
   * Parse the document buffer and compute tokenized spans for all lines.
   */
  update(buffer: ITextBuffer): void {
    if (!this.parser) return;

    this.lineTokensMap.clear();
    const source = buffer.getText();
    if (!source) return;

    try {
      // Incremental parse using previous tree when available for maximum performance
      this.tree = this.parser.parse(source, this.tree || undefined);
      if (!this.tree) return;

      const query = TreeSitterHighlighter.loadedQueries.get(this.currentLanguage);
      if (query) {
        this.collectTokensFromQuery(query, this.tree.rootNode, buffer);
      } else {
        this.collectTokens(this.tree.rootNode, null, buffer);
      }
    } catch {
      // In case of parser error, gracefully leave tokens empty
    }
  }

  /**
   * Get token spans for a specific 1-based line number.
   */
  getLineTokens(lineNumber: number): ILineToken[] | undefined {
    return this.lineTokensMap.get(lineNumber);
  }

  /**
   * Collect tokens using SCM pattern matches (Helix / Neovim style highlights.scm).
   */
  private collectTokensFromQuery(query: Parser.Query, root: Parser.SyntaxNode, buffer: ITextBuffer): void {
    const captures = query.captures(root);
    for (const capture of captures) {
      const tokenType = this.mapCaptureNameToType(capture.name);
      if (!tokenType) continue;

      const node = capture.node;
      const startPos = node.startPosition;
      const endPos = node.endPosition;

      if (startPos.row === endPos.row) {
        const lineNum = startPos.row + 1;
        this.pushOrUpdateToken(lineNum, {
          startIndex: startPos.column,
          endIndex: endPos.column,
          type: tokenType
        });
      } else {
        for (let r = startPos.row; r <= endPos.row; r++) {
          const lineNum = r + 1;
          const lineLen = buffer.getLineLength(lineNum);
          const startCol = r === startPos.row ? startPos.column : 0;
          const endCol = r === endPos.row ? endPos.column : lineLen;

          if (endCol > startCol) {
            this.pushOrUpdateToken(lineNum, {
              startIndex: startCol,
              endIndex: endCol,
              type: tokenType
            });
          }
        }
      }
    }
  }

  /**
   * Walk the Tree-sitter CST and collect syntax tokens (AST Visitor fallback).
   */
  private collectTokens(
    node: Parser.SyntaxNode,
    parent: Parser.SyntaxNode | null,
    buffer: ITextBuffer
  ): void {
    const childCount = node.childCount;

    if (childCount === 0) {
      const kind = node.type;
      const tokenType = this.mapKindToType(kind, parent);

      if (tokenType) {
        const startPos = node.startPosition;
        const endPos = node.endPosition;

        if (startPos.row === endPos.row) {
          const lineNum = startPos.row + 1;
          this.pushOrUpdateToken(lineNum, {
            startIndex: startPos.column,
            endIndex: endPos.column,
            type: tokenType
          });
        } else {
          for (let r = startPos.row; r <= endPos.row; r++) {
            const lineNum = r + 1;
            const lineLen = buffer.getLineLength(lineNum);
            const startCol = r === startPos.row ? startPos.column : 0;
            const endCol = r === endPos.row ? endPos.column : lineLen;

            if (endCol > startCol) {
              this.pushOrUpdateToken(lineNum, {
                startIndex: startCol,
                endIndex: endCol,
                type: tokenType
              });
            }
          }
        }
      }
    } else {
      for (let i = 0; i < childCount; i++) {
        const child = node.child(i);
        if (child) {
          this.collectTokens(child, node, buffer);
        }
      }
    }
  }

  private pushOrUpdateToken(lineNumber: number, token: ILineToken): void {
    let list = this.lineTokensMap.get(lineNumber);
    if (!list) {
      list = [];
      this.lineTokensMap.set(lineNumber, list);
    }
    const existing = list.find(t => t.startIndex === token.startIndex && t.endIndex === token.endIndex);
    if (existing) {
      existing.type = token.type;
    } else {
      list.push(token);
    }
  }

  /**
   * Map SCM capture names (e.g. 'keyword.control', 'function.method') to theme scopes.
   */
  private mapCaptureNameToType(name: string): string | undefined {
    if (name.startsWith('keyword')) return 'keyword';
    if (name.startsWith('function') || name === 'constructor') return 'function';
    if (name.startsWith('string')) return 'string';
    if (name.startsWith('constant.numeric')) return 'number';
    if (name.startsWith('constant')) return 'constant';
    if (name.startsWith('comment')) return 'comment';
    if (name.startsWith('type')) return 'type';
    if (name.startsWith('operator')) return 'operator';
    if (name.startsWith('variable.other.member') || name === 'property') return 'property';
    if (name.startsWith('variable')) return 'variable';
    if (name.startsWith('punctuation')) return 'punctuation';
    return undefined;
  }

  /**
   * Map raw Tree-sitter AST node type and parent context to standard theme scope.
   */
  private mapKindToType(kind: string, parent: Parser.SyntaxNode | null): string | undefined {
    if (kind === 'type_identifier' || (kind === 'string' && parent?.type === 'predefined_type') || kind === 'predefined_type') {
      return 'type';
    }

    if (KEYWORDS.has(kind)) return 'keyword';

    if (
      kind === 'true' || kind === 'false' || kind === 'null' || kind === 'undefined' ||
      kind === 'nil' || kind === 'None' || kind === 'True' || kind === 'False'
    ) {
      return 'constant';
    }

    if (kind === 'number' || kind === 'integer' || kind === 'float') return 'number';

    if (kind === 'comment' || kind === 'line_comment' || kind === 'block_comment') return 'comment';

    if (
      kind === 'string' ||
      kind === 'string_fragment' ||
      kind === 'string_content' ||
      kind === 'string_start' ||
      kind === 'string_end' ||
      kind === 'escape_sequence' ||
      ((kind === '"' || kind === "'" || kind === '`') && (parent?.type === 'string' || parent?.type === 'template_string'))
    ) {
      return 'string';
    }

    if (kind === 'identifier') {
      if (parent) {
        const pKind = parent.type;
        if (
          pKind === 'function_declaration' ||
          pKind === 'function_definition' ||
          pKind === 'function_expression' ||
          pKind === 'method_definition' ||
          pKind === 'call_expression' ||
          pKind === 'call'
        ) {
          return 'function';
        }
        if (pKind === 'member_expression' || pKind === 'attribute') {
          return 'property';
        }
      }
      return 'variable';
    }

    if (kind === 'property_identifier' || kind === 'field_identifier') return 'property';
    if (OPERATORS.has(kind)) return 'operator';
    if (PUNCTUATION.has(kind)) return 'punctuation';

    return undefined;
  }
}
