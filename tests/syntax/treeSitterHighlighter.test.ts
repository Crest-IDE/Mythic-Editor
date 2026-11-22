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

  it('correctly tokenizes nested expressions in template strings without dropping inner tokens', () => {
    const highlighter = new TreeSitterHighlighter('javascript');
    const code = 'const msg = `Hello ${user}!`;';
    const buffer = new PieceTreeTextBuffer(code, '\n');

    highlighter.update(buffer);

    const tokens = highlighter.getLineTokens(1);
    expect(tokens).toBeDefined();

    // Verify token spans are non-overlapping and contiguous within expressions
    for (let i = 1; i < tokens!.length; i++) {
      expect(tokens![i].startIndex).toBeGreaterThanOrEqual(tokens![i - 1].endIndex);
    }

    // Must have 'const' as keyword
    const kw = tokens!.find(t => t.type === 'keyword');
    expect(kw).toBeDefined();
    expect(code.slice(kw!.startIndex, kw!.endIndex)).toBe('const');

    // Must have 'msg' as variable
    const varMsg = tokens!.find(t => t.type === 'variable' && code.slice(t.startIndex, t.endIndex) === 'msg');
    expect(varMsg).toBeDefined();

    // Must have template string prefix `Hello ` as string
    const strPrefix = tokens!.find(t => t.type === 'string' && code.slice(t.startIndex, t.endIndex).includes('Hello'));
    expect(strPrefix).toBeDefined();

    // Must have `${` as punctuation
    const interpStart = tokens!.find(t => t.type === 'punctuation' && code.slice(t.startIndex, t.endIndex) === '${');
    expect(interpStart).toBeDefined();

    // Must have inner variable 'user'
    const innerVar = tokens!.find(t => t.type === 'variable' && code.slice(t.startIndex, t.endIndex) === 'user');
    expect(innerVar).toBeDefined();

    // Must have `}` as punctuation
    const interpEnd = tokens!.find(t => t.type === 'punctuation' && code.slice(t.startIndex, t.endIndex) === '}');
    expect(interpEnd).toBeDefined();

    // Must have template string suffix `!` as string
    const strSuffix = tokens!.find(t => t.type === 'string' && code.slice(t.startIndex, t.endIndex).includes('!'));
    expect(strSuffix).toBeDefined();
  });

  it('correctly tokenizes Python f-strings with embedded variables', () => {
    const highlighter = new TreeSitterHighlighter('python');
    const code = 'val = f"Count: {total}"';
    const buffer = new PieceTreeTextBuffer(code, '\n');

    highlighter.update(buffer);

    const tokens = highlighter.getLineTokens(1);
    expect(tokens).toBeDefined();

    // Must contain inner variable 'total'
    const innerVar = tokens!.find(t => t.type === 'variable' && code.slice(t.startIndex, t.endIndex) === 'total');
    expect(innerVar).toBeDefined();

    // Must contain string parts
    const strPart = tokens!.find(t => t.type === 'string');
    expect(strPart).toBeDefined();
  });
});
