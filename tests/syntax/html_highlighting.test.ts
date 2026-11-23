import { describe, it, expect, beforeAll } from 'vitest';
import { TreeSitterHighlighter } from '../../src/syntax/TreeSitterHighlighter';
import { PieceTreeTextBuffer } from '../../src/core/buffer/PieceTreeTextBuffer';
import { LanguageConfigurationRegistry } from '../../src/core/language/LanguageConfigurationRegistry';

describe('HTML Tree-sitter & Language Registration', () => {
  beforeAll(async () => {
    await TreeSitterHighlighter.init();
  });

  describe('LanguageConfigurationRegistry', () => {
    const registry = LanguageConfigurationRegistry.getInstance();

    it('identifies HTML files by extension', () => {
      expect(registry.getLanguageIdByFilename('index.html')).toBe('html');
      expect(registry.getLanguageIdByFilename('about.htm')).toBe('html');
      expect(registry.getGrammarName('html')).toBe('html');
    });

    it('provides correct comments and auto closing for HTML', () => {
      const comments = registry.getComments('html');
      expect(comments?.blockComment).toEqual(['<!--', '-->']);

      const autoClosing = registry.getAutoClosingPairs('html');
      expect(autoClosing.some(p => p.open === '<' && p.close === '>')).toBe(true);
    });
  });

  describe('HTML Tree-sitter Highlighting', () => {
    it('tokenizes HTML tags, attributes, strings, comments and doctype', async () => {
      const highlighter = new TreeSitterHighlighter('html');
      const loaded = await highlighter.ready();
      expect(loaded).toBe(true);

      const htmlContent = [
        '<!DOCTYPE html>',
        '<!-- Main container -->',
        '<div class="app-header" id="top">',
        '  <a href="https://mythic.dev">Click</a>',
        '</div>'
      ].join('\n');

      const buffer = new PieceTreeTextBuffer(htmlContent, '\n');
      highlighter.update(buffer);

      // Line 1: <!DOCTYPE html>
      const line1 = highlighter.getLineTokens(1);
      expect(line1).toBeDefined();
      expect(line1!.some(t => t.type === 'constant')).toBe(true);

      // Line 2: <!-- Main container -->
      const line2 = highlighter.getLineTokens(2);
      expect(line2).toBeDefined();
      expect(line2!.some(t => t.type === 'comment')).toBe(true);

      // Line 3: <div class="app-header" id="top">
      const line3 = highlighter.getLineTokens(3);
      expect(line3).toBeDefined();
      // Should find tag 'div'
      const tagToken = line3!.find(t => t.type === 'tag');
      expect(tagToken).toBeDefined();
      expect(htmlContent.split('\n')[2].slice(tagToken!.startIndex, tagToken!.endIndex)).toBe('div');

      // Should find attribute 'class' or 'id'
      const attrToken = line3!.find(t => t.type === 'attribute');
      expect(attrToken).toBeDefined();

      // Should find string value '"app-header"' or '"top"'
      const strToken = line3!.find(t => t.type === 'string');
      expect(strToken).toBeDefined();
    });
  });
});
