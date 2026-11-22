import { describe, it, expect } from 'vitest';
import {
  LanguageConfigurationRegistry,
  PLAINTEXT_LANGUAGE_ID
} from '@mythic/core/language/LanguageConfigurationRegistry';
import { EditorView } from '@mythic/view/EditorView';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';

describe('LanguageConfigurationRegistry (VS Code Architecture)', () => {
  const registry = LanguageConfigurationRegistry.getInstance();

  it('provides default configurations for core languages', () => {
    const jsComments = registry.getComments('javascript');
    expect(jsComments?.lineComment).toBe('//');
    expect(jsComments?.blockComment).toEqual(['/*', '*/']);

    const pyComments = registry.getComments('python');
    expect(pyComments?.lineComment).toBe('#');

    const plaintext = registry.getLanguageConfiguration(PLAINTEXT_LANGUAGE_ID);
    expect(plaintext.id).toBe(PLAINTEXT_LANGUAGE_ID);
    expect(plaintext.brackets).toBeDefined();
  });

  it('correctly detects languageId from filenames across 340+ Helix language definitions', () => {
    expect(registry.getLanguageIdByFilename('src/main.rs')).toBe('rust');
    expect(registry.getLanguageIdByFilename('scripts/data_cleaner.py')).toBe('python');
    expect(registry.getLanguageIdByFilename('src/index.ts')).toBe('typescript');
    expect(registry.getLanguageIdByFilename('cmd/server/main.go')).toBe('go');
    expect(registry.getLanguageIdByFilename('app/src/MainActivity.kt')).toBe('kotlin');
    expect(registry.getLanguageIdByFilename('init.lua')).toBe('lua');
    expect(registry.getLanguageIdByFilename('styles.css')).toBe('css');
    expect(registry.getLanguageIdByFilename('index.html')).toBe('html');
    expect(registry.getLanguageIdByFilename('Cargo.toml')).toBe('toml');
    expect(registry.getLanguageIdByFilename('unknown.some_random_ext')).toBe(PLAINTEXT_LANGUAGE_ID);
  });

  it('supports runtime registration of custom languages and file extensions', () => {
    registry.register('my-custom-lang', {
      comments: { lineComment: '--', blockComment: ['{-', '-}'] },
      indentation: { tabSize: 3, insertSpaces: true },
      grammar: 'custom_grammar'
    });
    registry.registerFileExtension('custom', 'my-custom-lang');

    expect(registry.getLanguageIdByFilename('file.custom')).toBe('my-custom-lang');
    expect(registry.getComments('my-custom-lang')?.lineComment).toBe('--');
    expect(registry.getComments('my-custom-lang')?.blockComment).toEqual(['{-', '-}']);
    expect(registry.getGrammarName('my-custom-lang')).toBe('custom_grammar');
  });

  it('toggles line comments in EditorView using language-aware comment tokens', () => {
    // Setup Mock DOM
    (globalThis as any).document = {
      createElement: () => ({
        style: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        appendChild: (c: any) => c,
        removeChild: (c: any) => c,
        replaceChildren: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        focus: () => {},
        blur: () => {}
      }),
      createTextNode: (text: string) => ({ textContent: text }),
      createDocumentFragment: () => ({ isFragment: true, childNodes: [] }),
      body: {
        appendChild: () => {},
        removeChild: () => {}
      }
    };
    (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {} };

    // 1. Test Python line comment toggling (#)
    const pyCode = 'def hello():\n    return 42';
    const pyBuffer = new PieceTreeTextBuffer(pyCode, '\n');
    const mount = (globalThis as any).document.createElement('div');
    const pyEditor = new EditorView(mount, pyBuffer, {
      filename: 'script.py'
    });

    expect(pyEditor.getLanguageId()).toBe('python');

    // Toggle comment on line 1
    pyEditor.toggleLineComment();
    expect(pyBuffer.getLineContent(1)).toBe('# def hello():');

    // Toggle again to uncomment
    pyEditor.toggleLineComment();
    expect(pyBuffer.getLineContent(1)).toBe('def hello():');

    // 2. Test Rust / JS line comment toggling (//)
    pyEditor.setLanguage('main.rs');
    expect(pyEditor.getLanguageId()).toBe('rust');

    pyEditor.toggleLineComment();
    expect(pyBuffer.getLineContent(1)).toBe('// def hello():');

    pyEditor.toggleLineComment();
    expect(pyBuffer.getLineContent(1)).toBe('def hello():');
  });
});
