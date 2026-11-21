import { describe, it, expect, beforeAll } from 'vitest';
import { TreeSitterHighlighter } from '@mythic/syntax/TreeSitterHighlighter';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';

describe('TreeSitterHighlighter Subsystem', () => {
  beforeAll(async () => {
    await TreeSitterHighlighter.init();
    await TreeSitterHighlighter.loadLanguage('javascript');
    await TreeSitterHighlighter.loadLanguage('python');
  });

  it('initializes with default javascript parser and parses buffer', () => {
    const highlighter = new TreeSitterHighlighter('javascript');
    expect(highlighter.getLanguage()).toBe('javascript');

    const code = 'const answer = 42;\nfunction getAnswer() { return answer; }';
    const buffer = new PieceTreeTextBuffer(code, '\n');

    highlighter.update(buffer);

    // Line 1: const answer = 42;
    const line1Tokens = highlighter.getLineTokens(1);
    expect(line1Tokens).toBeDefined();
    expect(line1Tokens!.length).toBeGreaterThanOrEqual(4);

    const keyword = line1Tokens!.find(t => t.type === 'keyword');
    expect(keyword).toBeDefined();
    expect(code.slice(keyword!.startIndex, keyword!.endIndex)).toBe('const');

    const number = line1Tokens!.find(t => t.type === 'number');
    expect(number).toBeDefined();
    expect(code.slice(number!.startIndex, number!.endIndex)).toBe('42');

    // Line 2: function getAnswer() { return answer; }
    const line2Tokens = highlighter.getLineTokens(2);
    expect(line2Tokens).toBeDefined();
    const func = line2Tokens!.find(t => t.type === 'function');
    expect(func).toBeDefined();
  });

  it('switches languages dynamically (e.g. to Python)', () => {
    const highlighter = new TreeSitterHighlighter('javascript');
    const switched = highlighter.setLanguage('python');
    expect(switched).toBe(true);
    expect(highlighter.getLanguage()).toBe('python');

    const pyCode = 'def greet(name):\n    print("Hello " + name)';
    const buffer = new PieceTreeTextBuffer(pyCode, '\n');

    highlighter.update(buffer);

    const line1Tokens = highlighter.getLineTokens(1);
    expect(line1Tokens).toBeDefined();

    const defKeyword = line1Tokens!.find(t => t.type === 'keyword');
    expect(defKeyword).toBeDefined();

    const line2Tokens = highlighter.getLineTokens(2);
    expect(line2Tokens).toBeDefined();
    const strToken = line2Tokens!.find(t => t.type === 'string');
    expect(strToken).toBeDefined();
  });

  it('handles multiline comments correctly across lines', () => {
    const highlighter = new TreeSitterHighlighter('javascript');
    const code = '/*\n * Line 2\n */\nlet x = 1;';
    const buffer = new PieceTreeTextBuffer(code, '\n');

    highlighter.update(buffer);

    // Line 1, 2, 3 should all have comment tokens
    expect(highlighter.getLineTokens(1)?.some(t => t.type === 'comment')).toBe(true);
    expect(highlighter.getLineTokens(2)?.some(t => t.type === 'comment')).toBe(true);
    expect(highlighter.getLineTokens(3)?.some(t => t.type === 'comment')).toBe(true);

    // Line 4 should have keyword 'let'
    expect(highlighter.getLineTokens(4)?.some(t => t.type === 'keyword')).toBe(true);
  });

  it('gracefully handles empty buffer', () => {
    const highlighter = new TreeSitterHighlighter('javascript');
    const buffer = new PieceTreeTextBuffer('', '\n');

    highlighter.update(buffer);
    expect(highlighter.getLineTokens(1)).toBeUndefined();
  });
});
