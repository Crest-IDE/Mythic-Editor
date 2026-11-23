import { describe, it, expect, beforeEach } from 'vitest';
import { OnEnterSupport } from '@mythic/core/language/OnEnterSupport';
import { LanguageConfigurationRegistry } from '@mythic/core/language/LanguageConfigurationRegistry';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { EditorView } from '@mythic/view/EditorView';
import { Selection } from '@mythic/core/model/Selection';

describe('OnEnterSupport (Monaco Auto-Indentation Architecture)', () => {
  const registry = LanguageConfigurationRegistry.getInstance();

  it('preserves leading indentation on normal code lines', () => {
    const jsConfig = registry.getLanguageConfiguration('javascript');
    const result = OnEnterSupport.getEnterResult('    const a = 10;', '', jsConfig);

    expect(result.textToInsert).toBe('\n    ');
    expect(result.cursorOffset).toBe(5); // '\n' + 4 spaces
    expect(result.deleteCount).toBe(0);
    expect(result.deleteBeforeCount).toBe(0);
  });

  it('splits between matching curly braces { | } into 3 lines (IndentOutdent)', () => {
    const jsConfig = registry.getLanguageConfiguration('javascript');
    // Cursor between { and }
    const result = OnEnterSupport.getEnterResult('function foo() {', '}', jsConfig);

    // JS has tabSize 2: indentedLine is '  ', closing line is ''
    expect(result.textToInsert).toBe('\n  \n');
    expect(result.cursorOffset).toBe(3); // after '\n  '
    expect(result.deleteCount).toBe(0);
    expect(result.deleteBeforeCount).toBe(0);
  });

  it('splits between matching brackets with surrounding spaces { | } cleanly', () => {
    const jsConfig = registry.getLanguageConfiguration('javascript');
    // Spaces between brackets: '{ ' and ' }'
    const result = OnEnterSupport.getEnterResult('function foo() { ', ' }', jsConfig);

    expect(result.textToInsert).toBe('\n  \n');
    expect(result.deleteBeforeCount).toBe(1); // trims space before cursor
    expect(result.deleteCount).toBe(1); // trims space after cursor
    expect(result.cursorOffset).toBe(3);
  });

  it('splits square brackets [ | ] and parentheses ( | )', () => {
    const jsConfig = registry.getLanguageConfiguration('javascript');

    const arrayResult = OnEnterSupport.getEnterResult('const arr = [', '];', jsConfig);
    expect(arrayResult.textToInsert).toBe('\n  \n');

    const parenResult = OnEnterSupport.getEnterResult('callFunction(', ');', jsConfig);
    expect(parenResult.textToInsert).toBe('\n  \n');
  });

  it('auto-indents after an opening brace statement in JS/TS', () => {
    const jsConfig = registry.getLanguageConfiguration('javascript');
    const result = OnEnterSupport.getEnterResult('if (condition) {', '', jsConfig);

    // JS tabSize is 2: +2 spaces
    expect(result.textToInsert).toBe('\n  ');
    expect(result.cursorOffset).toBe(3);
  });

  it('auto-indents after colon (:) in Python', () => {
    const pyConfig = registry.getLanguageConfiguration('python');

    const defResult = OnEnterSupport.getEnterResult('def compute_sum(a, b):', '', pyConfig);
    // Python tabSize is 4
    expect(defResult.textToInsert).toBe('\n    ');
    expect(defResult.cursorOffset).toBe(5);

    const ifResult = OnEnterSupport.getEnterResult('    if a > b:', '', pyConfig);
    // Base 4 spaces + 4 spaces = 8 spaces
    expect(ifResult.textToInsert).toBe('\n        ');
    expect(ifResult.cursorOffset).toBe(9);
  });

  it('continues JSDoc and multiline comments cleanly', () => {
    const jsConfig = registry.getLanguageConfiguration('javascript');

    // Case 1: Entering inside /** | */
    const blockResult = OnEnterSupport.getEnterResult('/** ', ' */', jsConfig);
    expect(blockResult.textToInsert).toBe('\n * \n');

    // Case 2: Continuing JSDoc line /**
    const docResult = OnEnterSupport.getEnterResult('/**', '', jsConfig);
    expect(docResult.textToInsert).toBe('\n * ');

    // Case 3: Continuing existing comment line *
    const lineResult = OnEnterSupport.getEnterResult(' * Some documentation', '', jsConfig);
    expect(lineResult.textToInsert).toBe('\n * ');
  });

  it('correctly outdents when closing bracket is typed at indentation level', () => {
    const jsConfig = registry.getLanguageConfiguration('javascript');
    const result = OnEnterSupport.getEnterResult('', '  }', jsConfig);

    expect(result.textToInsert).toBe('\n');
  });
});

describe('EditorView Auto-Indentation Integration', () => {
  let mockElement: any;

  beforeEach(() => {
    mockElement = {
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
    };
    (globalThis as any).document = {
      createElement: () => mockElement,
      createTextNode: (text: string) => ({ textContent: text }),
      createDocumentFragment: () => ({ isFragment: true, childNodes: [] }),
      body: { appendChild: () => {}, removeChild: () => {} }
    };
    (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {} };
  });

  it('automatically splits {|} into 3 lines with cursor in the middle in EditorView', () => {
    const buffer = new PieceTreeTextBuffer('function test() {}', '\n');
    const editor = new EditorView(mockElement, buffer, { languageId: 'javascript' });

    // Place cursor between { and } (line 1, column 18)
    editor.setSelection(new Selection(1, 18, 1, 18));

    // Simulate pressing Enter
    editor.handleKey('ENTER');

    expect(buffer.getLineCount()).toBe(3);
    expect(buffer.getLineContent(1)).toBe('function test() {');
    expect(buffer.getLineContent(2)).toBe('  ');
    expect(buffer.getLineContent(3)).toBe('}');

    // Cursor should be at line 2, col 3
    const newPos = editor.getSelection().getPosition();
    expect(newPos.lineNumber).toBe(2);
    expect(newPos.column).toBe(3);
  });

  it('supports undo and redo of auto-indented enter as a single atomic operation', () => {
    const buffer = new PieceTreeTextBuffer('function test() {}', '\n');
    const editor = new EditorView(mockElement, buffer, { languageId: 'javascript' });

    editor.setSelection(new Selection(1, 18, 1, 18));
    editor.handleKey('ENTER');

    expect(buffer.getLineCount()).toBe(3);

    // Undo should restore single line immediately
    expect(editor.undo()).toBe(true);
    expect(buffer.getLineCount()).toBe(1);
    expect(buffer.getText()).toBe('function test() {}');

    // Redo should recreate the 3 indented lines
    expect(editor.redo()).toBe(true);
    expect(buffer.getLineCount()).toBe(3);
    expect(buffer.getLineContent(2)).toBe('  ');
  });

  it('auto-indents Python blocks on Enter', () => {
    const buffer = new PieceTreeTextBuffer('def add(a, b):', '\n');
    const editor = new EditorView(mockElement, buffer, { filename: 'math_utils.py' });

    expect(editor.getLanguageId()).toBe('python');

    // Move cursor to end of line
    editor.setSelection(new Selection(1, 15, 1, 15));
    editor.handleKey('ENTER');

    expect(buffer.getLineCount()).toBe(2);
    expect(buffer.getLineContent(1)).toBe('def add(a, b):');
    expect(buffer.getLineContent(2)).toBe('    ');

    const pos = editor.getSelection().getPosition();
    expect(pos.lineNumber).toBe(2);
    expect(pos.column).toBe(5);
  });
});
