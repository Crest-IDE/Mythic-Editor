/**
 * Mythic Editor - Language Configuration Registry & Service
 *
 * Implements VS Code's LanguageConfigurationRegistry / ILanguageConfigurationService
 * architecture (/src/vs/editor/common/languages/languageConfigurationRegistry.ts).
 * Backed by Helix's 342+ language dataset and extensible at runtime.
 */

import {
  LanguageConfiguration,
  CommentRule,
  CharacterPair,
  IAutoClosingPair,
  IAutoClosingPairConditional
} from './languageConfiguration';

import rawHelixLanguages from './languages.json';

export const PLAINTEXT_LANGUAGE_ID = 'plaintext';

export interface ILanguageDefinitionRaw {
  id: string;
  extensions: string[];
  lineComment?: string;
  blockComment?: [string, string];
  tabSize?: number;
  grammar?: string;
}

export class LanguageConfigurationRegistry {
  private static instance: LanguageConfigurationRegistry | null = null;

  private configurations: Map<string, LanguageConfiguration> = new Map();
  private extensionToLanguageMap: Map<string, string> = new Map();
  private grammarMap: Map<string, string> = new Map();

  constructor() {
    this.registerDefaults();
    this.loadHelixDataset();
  }

  /**
   * Global singleton instance access (Monaco ILanguageConfigurationService accessor).
   */
  static getInstance(): LanguageConfigurationRegistry {
    if (!LanguageConfigurationRegistry.instance) {
      LanguageConfigurationRegistry.instance = new LanguageConfigurationRegistry();
    }
    return LanguageConfigurationRegistry.instance;
  }

  /**
   * Register or override a language configuration (matching VS Code's register()).
   */
  register(languageId: string, config: LanguageConfiguration): void {
    const existing = this.configurations.get(languageId) || {};
    const merged: LanguageConfiguration = {
      id: languageId,
      comments: config.comments !== undefined ? config.comments : existing.comments,
      brackets: config.brackets || existing.brackets,
      autoClosingPairs: config.autoClosingPairs || existing.autoClosingPairs,
      surroundingPairs: config.surroundingPairs || existing.surroundingPairs,
      indentation: config.indentation || existing.indentation,
      wordPattern: config.wordPattern || existing.wordPattern,
      grammar: config.grammar || existing.grammar || languageId
    };

    this.configurations.set(languageId, merged);
    if (merged.grammar) {
      this.grammarMap.set(languageId, merged.grammar);
    }
  }

  /**
   * Register a file extension (e.g. 'rs', 'py', 'ts') to a languageId.
   */
  registerFileExtension(extension: string, languageId: string): void {
    const cleanExt = extension.startsWith('.') ? extension.slice(1).toLowerCase() : extension.toLowerCase();
    this.extensionToLanguageMap.set(cleanExt, languageId);
  }

  /**
   * Get resolved language configuration for a given language ID.
   */
  getLanguageConfiguration(languageId: string): LanguageConfiguration {
    const config = this.configurations.get(languageId);
    if (config) return config;

    // Fallback to plaintext configuration
    return this.configurations.get(PLAINTEXT_LANGUAGE_ID)!;
  }

  /**
   * Get comments configuration for line / block comment operations.
   */
  getComments(languageId: string): CommentRule | undefined {
    return this.getLanguageConfiguration(languageId).comments;
  }

  /**
   * Get bracket pairs for indentation and structural operations.
   */
  getBrackets(languageId: string): CharacterPair[] {
    return this.getLanguageConfiguration(languageId).brackets || [
      ['(', ')'],
      ['[', ']'],
      ['{', '}']
    ];
  }

  /**
   * Get auto closing pairs for the language.
   */
  getAutoClosingPairs(languageId: string): IAutoClosingPairConditional[] {
    return this.getLanguageConfiguration(languageId).autoClosingPairs || [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ];
  }

  /**
   * Get surrounding pairs when typing around an active text selection.
   */
  getSurroundingPairs(languageId: string): IAutoClosingPair[] {
    return this.getLanguageConfiguration(languageId).surroundingPairs || [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ];
  }

  /**
   * Detect language ID from a file path or filename (e.g. 'src/main.rs' -> 'rust').
   */
  getLanguageIdByFilename(filenameOrPath: string): string {
    const filename = filenameOrPath.split(/[/|\\]/).pop() || filenameOrPath;
    const parts = filename.split('.');
    if (parts.length > 1) {
      const ext = parts.pop()!.toLowerCase();
      const lang = this.extensionToLanguageMap.get(ext);
      if (lang) return lang;
    }

    // Direct filename checks (e.g. Dockerfile, Makefile)
    const directLang = this.extensionToLanguageMap.get(filename.toLowerCase());
    if (directLang) return directLang;

    return PLAINTEXT_LANGUAGE_ID;
  }

  /**
   * Get the Tree-sitter grammar name for a language (e.g. 'typescript' for 'tsx').
   */
  getGrammarName(languageId: string): string {
    return this.grammarMap.get(languageId) || languageId;
  }

  /**
   * Register default Monaco fallback configs (plaintext, JS, TS, Python).
   */
  private registerDefaults(): void {
    const defaultBrackets: CharacterPair[] = [
      ['(', ')'],
      ['[', ']'],
      ['{', '}']
    ];

    const defaultAutoClose: IAutoClosingPairConditional[] = [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ];

    const defaultSurrounding: IAutoClosingPair[] = [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ];

    this.register(PLAINTEXT_LANGUAGE_ID, {
      id: PLAINTEXT_LANGUAGE_ID,
      brackets: defaultBrackets,
      autoClosingPairs: defaultAutoClose,
      surroundingPairs: defaultSurrounding,
      indentation: { tabSize: 4, insertSpaces: true }
    });

    this.register('javascript', {
      id: 'javascript',
      comments: { lineComment: '//', blockComment: ['/*', '*/'] },
      brackets: defaultBrackets,
      autoClosingPairs: defaultAutoClose,
      surroundingPairs: defaultSurrounding,
      indentation: { tabSize: 2, insertSpaces: true },
      grammar: 'javascript'
    });

    this.register('typescript', {
      id: 'typescript',
      comments: { lineComment: '//', blockComment: ['/*', '*/'] },
      brackets: defaultBrackets,
      autoClosingPairs: defaultAutoClose,
      surroundingPairs: defaultSurrounding,
      indentation: { tabSize: 2, insertSpaces: true },
      grammar: 'typescript'
    });

    this.register('python', {
      id: 'python',
      comments: { lineComment: '#', blockComment: ['"""', '"""'] },
      brackets: defaultBrackets,
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
      ],
      surroundingPairs: defaultSurrounding,
      indentation: { tabSize: 4, insertSpaces: true },
      grammar: 'python'
    });
  }

  /**
   * Ingest Helix's 342-language database into the registry.
   */
  private loadHelixDataset(): void {
    const rawList = rawHelixLanguages as ILanguageDefinitionRaw[];
    for (const item of rawList) {
      if (!item.id) continue;

      // Register extensions
      if (Array.isArray(item.extensions)) {
        for (const ext of item.extensions) {
          this.registerFileExtension(ext, item.id);
        }
      }

      // Register or update configuration
      this.register(item.id, {
        id: item.id,
        comments: {
          lineComment: item.lineComment || null,
          blockComment: item.blockComment || null
        },
        indentation: {
          tabSize: item.tabSize || 4,
          insertSpaces: true
        },
        grammar: item.grammar || item.id
      });
    }
  }
}
