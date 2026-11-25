/**
 * Mythic Editor - Tree-sitter Syntax Highlighter
 *
 * Official web-tree-sitter WebAssembly integration for Mythic's ITextBuffer
 * and RenderedLinesCollection tokenization engine. Pure SCM Query-driven
 * syntax highlighting (Helix / Neovim standard).
 */

import Parser from 'web-tree-sitter';
import { ITextBuffer } from '../core/buffer/ITextBuffer';
import { ILineToken, ILineTokensProvider } from '../view/RenderedLinesCollection';

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

/**
 * Universal binary asset loader:
 * Works in Browser (HTTP 200), Node/Vitest (fs), and Android WebView (file:/// via XMLHttpRequest with status 0).
 */
async function fetchBinaryAsset(url: string): Promise<Uint8Array> {
  const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
  if (isNode) {
    try {
      const fsModuleName = 'fs';
      const fs = await import(/* @vite-ignore */ fsModuleName);
      const clean = url.replace(/^\.\//, '');
      const candidates = [url, `./public/${clean}`, clean];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          const buffer = fs.readFileSync(cand);
          return new Uint8Array(buffer);
        }
      }
    } catch {
      // Fall through
    }
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise<Uint8Array>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if (xhr.status === 200 || (xhr.status === 0 && xhr.response)) {
          resolve(new Uint8Array(xhr.response));
        } else {
          reject(new Error(`XHR failed for ${url} (status: ${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error(`XHR network error for ${url}`));
      xhr.send(null);
    });
  }

  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Universal text asset loader (for SCM queries):
 * Works in Browser, Node/Vitest, and Android WebView (file:/// via XMLHttpRequest with status 0).
 */
async function fetchTextAsset(url: string): Promise<string> {
  const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
  if (isNode) {
    try {
      const fsModuleName = 'fs';
      const fs = await import(/* @vite-ignore */ fsModuleName);
      const clean = url.replace(/^\.\//, '');
      const candidates = [url, `./public/${clean}`, clean];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          return fs.readFileSync(cand, 'utf8');
        }
      }
    } catch {
      // Fall through
    }
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onload = () => {
        if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
          resolve(xhr.responseText);
        } else {
          reject(new Error(`XHR failed for ${url} (status: ${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error(`XHR network error for ${url}`));
      xhr.send(null);
    });
  }

  const res = await fetch(url);
  return await res.text();
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
        const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
        if (isNode) {
          return `./public/${scriptName}`;
        }
        if (typeof window !== 'undefined' && window.location && window.location.href) {
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
        const wasmBytes = await fetchBinaryAsset(target);
        lang = await Parser.Language.load(wasmBytes);
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
      const defaultQueryPath = () => {
        const fileName = `queries/${name}.scm`;
        if (typeof window !== 'undefined' || typeof document !== 'undefined') {
          return `${getBaseUrl()}${fileName}`;
        }
        return `./public/${fileName}`;
      };
      const url = scmPathOrUrl || defaultQueryPath();
      try {
        scmText = await fetchTextAsset(url);
      } catch (e) {
        // Fallback or ignore if query missing
      }

      if (scmText && scmText.trim().length > 0) {
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
      if (this.tree) {
        try { this.tree.delete(); } catch (_) {}
        this.tree = null;
      }
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
      if (this.tree) {
        try { this.tree.delete(); } catch (_) {}
        this.tree = null;
      }
      this.tree = this.parser.parse(source);
      if (!this.tree) return;

      const query = TreeSitterHighlighter.loadedQueries.get(this.currentLanguage);
      if (query) {
        this.collectTokensFromQuery(query, this.tree.rootNode, buffer);
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
        this.applyTokenToLine(lineNum, startPos.column, endPos.column, tokenType);
      } else {
        for (let r = startPos.row; r <= endPos.row; r++) {
          const lineNum = r + 1;
          const lineLen = buffer.getLineLength(lineNum);
          const startCol = r === startPos.row ? startPos.column : 0;
          const endCol = r === endPos.row ? endPos.column : lineLen;

          if (endCol > startCol) {
            this.applyTokenToLine(lineNum, startCol, endCol, tokenType);
          }
        }
      }
    }
  }

  private applyTokenToLine(lineNumber: number, startIndex: number, endIndex: number, type: string): void {
    if (endIndex <= startIndex) return;
    const existing = this.lineTokensMap.get(lineNumber) || [];
    const updated = this.applyInterval(existing, startIndex, endIndex, type);
    this.lineTokensMap.set(lineNumber, updated);
  }

  /**
   * 1D Interval overwriting / carving algorithm:
   * Splits and replaces overlapping parent/earlier tokens with the more specific inner/later token.
   */
  private applyInterval(list: ILineToken[], newStart: number, newEnd: number, type: string): ILineToken[] {
    if (newEnd <= newStart) return list;
    const result: ILineToken[] = [];
    const insertedToken: ILineToken = { startIndex: newStart, endIndex: newEnd, type };
    let inserted = false;

    for (const token of list) {
      if (token.endIndex <= newStart) {
        result.push(token);
      } else if (token.startIndex >= newEnd) {
        if (!inserted) {
          result.push(insertedToken);
          inserted = true;
        }
        result.push(token);
      } else {
        // Overlaps with new token: preserve left portion strictly before newStart
        if (token.startIndex < newStart) {
          result.push({
            startIndex: token.startIndex,
            endIndex: newStart,
            type: token.type
          });
        }
        if (!inserted) {
          result.push(insertedToken);
          inserted = true;
        }
        // Preserve right portion strictly after newEnd
        if (token.endIndex > newEnd) {
          result.push({
            startIndex: newEnd,
            endIndex: token.endIndex,
            type: token.type
          });
        }
      }
    }

    if (!inserted) {
      result.push(insertedToken);
    }

    return result;
  }

  /**
   * Map SCM capture names (e.g. 'keyword.control', 'function.method') to theme scopes.
   */
  private mapCaptureNameToType(name: string): string | undefined {
    if (name.startsWith('keyword')) return 'keyword';
    if (name.startsWith('tag') || name === 'tag') return 'tag';
    if (name.startsWith('attribute')) return 'attribute';
    if (name.startsWith('function.builtin')) return 'function-builtin';
    if (name.startsWith('function.method')) return 'function-method';
    if (name.startsWith('function') || name === 'constructor') return 'function';
    if (name.startsWith('string')) return 'string';
    if (name.startsWith('constant.numeric')) return 'number';
    if (name.startsWith('constant.builtin')) return 'constant-builtin';
    if (name.startsWith('constant')) return 'constant';
    if (name.startsWith('comment')) return 'comment';
    if (name.startsWith('type.builtin')) return 'type-builtin';
    if (name.startsWith('type')) return 'type';
    if (name.startsWith('operator')) return 'operator';
    if (name.startsWith('variable.parameter')) return 'variable-parameter';
    if (name.startsWith('variable.builtin')) return 'variable-builtin';
    if (name.startsWith('variable.other.member') || name === 'property') return 'property';
    if (name.startsWith('variable')) return 'variable';
    if (name.startsWith('punctuation')) return 'punctuation';
    if (name.startsWith('namespace')) return 'type';
    if (name.startsWith('label')) return 'label';
    return undefined;
  }
}
