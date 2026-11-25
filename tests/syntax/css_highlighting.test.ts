import { describe, it, expect, beforeAll } from 'vitest';
import { TreeSitterHighlighter } from '../../src/syntax/TreeSitterHighlighter';
import { PieceTreeTextBuffer } from '../../src/core/buffer/PieceTreeTextBuffer';
import { LanguageConfigurationRegistry } from '../../src/core/language/LanguageConfigurationRegistry';

describe('CSS Tree-sitter & Language Registration', () => {
  beforeAll(async () => {
    await TreeSitterHighlighter.init();
  });

  describe('LanguageConfigurationRegistry', () => {
    const registry = LanguageConfigurationRegistry.getInstance();

    it('identifies CSS files by extension', () => {
      expect(registry.getLanguageIdByFilename('style.css')).toBe('css');
      expect(registry.getGrammarName('css')).toBe('css');
    });

    it('provides correct comments and brackets for CSS', () => {
      const comments = registry.getComments('css');
      expect(comments?.blockComment).toEqual(['/*', '*/']);

      const autoClosing = registry.getAutoClosingPairs('css');
      expect(autoClosing.some(p => p.open === '{' && p.close === '}')).toBe(true);
      expect(autoClosing.some(p => p.open === '(' && p.close === ')')).toBe(true);
    });
  });

  describe('CSS Tree-sitter Highlighting', () => {
    it('tokenizes CSS selectors, properties, values, units and comments', async () => {
      const highlighter = new TreeSitterHighlighter('css');
      const loaded = await highlighter.ready();
      expect(loaded).toBe(true);

      const cssContent = [
        '/* Header Styles */',
        ':root {',
        '  --primary: #3498db;',
        '}',
        'header.main-nav > ul#menu li.item {',
        '  display: flex;',
        '  color: var(--primary);',
        '  margin: 10px auto !important;',
        '}'
      ].join('\n');

      const buffer = new PieceTreeTextBuffer(cssContent, '\n');
      highlighter.update(buffer);

      // Line 1: /* Header Styles */
      const line1 = highlighter.getLineTokens(1);
      expect(line1).toBeDefined();
      expect(line1!.some(t => t.type === 'comment')).toBe(true);

      // Line 3: --primary: #3498db;
      const line3 = highlighter.getLineTokens(3);
      expect(line3).toBeDefined();
      expect(line3!.some(t => t.type === 'variable')).toBe(true);

      // Line 5: header.main-nav > ul#menu li.item {
      const line5 = highlighter.getLineTokens(5);
      expect(line5).toBeDefined();
      expect(line5!.some(t => t.type === 'tag')).toBe(true);
      expect(line5!.some(t => t.type === 'type')).toBe(true); // class selector
      expect(line5!.some(t => t.type === 'constant')).toBe(true); // id selector
      expect(line5!.some(t => t.type === 'operator')).toBe(true); // >

      // Line 6: display: flex;
      const line6 = highlighter.getLineTokens(6);
      expect(line6).toBeDefined();
      expect(line6!.some(t => t.type === 'property')).toBe(true);
      expect(line6!.some(t => t.type === 'constant')).toBe(true); // flex

      // Line 7: color: var(--primary);
      const line7 = highlighter.getLineTokens(7);
      expect(line7).toBeDefined();
      expect(line7!.some(t => t.type === 'property')).toBe(true);
      expect(line7!.some(t => t.type === 'function')).toBe(true); // var
      expect(line7!.some(t => t.type === 'variable')).toBe(true); // --primary

      // Line 8: margin: 10px auto !important;
      const line8 = highlighter.getLineTokens(8);
      expect(line8).toBeDefined();
      expect(line8!.some(t => t.type === 'property')).toBe(true);
      expect(line8!.some(t => t.type === 'number')).toBe(true); // 10px
      expect(line8!.some(t => t.type === 'keyword')).toBe(true); // !important or px
    });
  });
});
