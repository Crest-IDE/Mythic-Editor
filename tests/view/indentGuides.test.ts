import { describe, it, expect, beforeEach } from 'vitest';
import { IndentGuides, computeIndentLevel } from '@mythic/core/language/IndentGuides';
import { guessIndentation } from '@mythic/core/language/IndentationGuesser';
import { LanguageConfigurationRegistry } from '@mythic/core/language/LanguageConfigurationRegistry';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { Selection } from '@mythic/core/model/Selection';
import { Viewport } from '@mythic/view/Viewport';
import { ViewIndentGuides } from '@mythic/view/ViewIndentGuides';
import { EditorView } from '@mythic/view/EditorView';

class MockClassList {
  private classes = new Set<string>();
  constructor(initial: string = '') {
    if (initial) {
      initial.split(/\s+/).filter(Boolean).forEach(c => this.classes.add(c));
    }
  }
  add(...tokens: string[]) {
    tokens.forEach(t => this.classes.add(t));
  }
  remove(...tokens: string[]) {
    tokens.forEach(t => this.classes.delete(t));
  }
  contains(token: string) {
    return this.classes.has(token);
  }
}

class MockNode {
  childNodes: MockNode[] = [];
  parentNode: MockNode | null = null;
  textContent: string = '';

  appendChild(child: MockNode): MockNode {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: MockNode): MockNode {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChildren(...newChildren: MockNode[]): void {
    for (const c of this.childNodes) {
      c.parentNode = null;
    }
    this.childNodes = [];
    for (const c of newChildren) {
      c.parentNode = this;
      this.childNodes.push(c);
    }
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 };
  }

  setAttribute(_name: string, _value: string) {}
  removeAttribute(_name: string) {}
  getAttribute(_name: string) { return null; }
  addEventListener() {}
  removeEventListener() {}
  focus() {}
  blur() {}
}

class MockElement extends MockNode {
  private _className: string = '';
  style: Record<string, any> = {};
  clientWidth = 800;
  clientHeight = 600;
  scrollTop = 0;
  scrollLeft = 0;
  classList = new MockClassList();

  get className(): string {
    return this._className;
  }
  set className(val: string) {
    this._className = val;
    this.classList = new MockClassList(val);
  }
}

class MockDocumentFragment extends MockNode {
  readonly isFragment = true;
}

beforeEach(() => {
  (globalThis as any).document = {
    createElement: (_tag: string) => new MockElement(),
    createTextNode: (text: string) => {
      const node = new MockNode();
      node.textContent = text;
      return node;
    },
    createDocumentFragment: () => new MockDocumentFragment(),
    body: new MockElement()
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
});

/**
 * Direct port of VS Code's assertIndentGuides helper
 * Reference: vs/editor/test/common/model/textModelWithTokens.test.ts
 */
function assertIndentGuides(
  lines: [number, number, number, number, string][],
  indentSize: number,
  offSide: boolean = false
): void {
  const text = lines.map(l => l[4]).join('\n');
  const buffer = new PieceTreeTextBuffer(text, '\n');
  const options = { tabSize: indentSize, indentSize, offSide };

  const actualIndents = IndentGuides.getLinesIndentGuides(buffer, 1, buffer.getLineCount(), options);
  const actual: [number, number, number, number, string][] = [];

  for (let line = 1; line <= buffer.getLineCount(); line++) {
    const activeIndentGuide = IndentGuides.getActiveIndentGuide(buffer, line, 1, buffer.getLineCount(), options);
    actual[line - 1] = [
      actualIndents[line - 1],
      activeIndentGuide.startLineNumber,
      activeIndentGuide.endLineNumber,
      activeIndentGuide.indent,
      buffer.getLineContent(line)
    ];
  }

  expect(actual).toEqual(lines);
}

describe('IndentGuides Core Algorithm (VS Code Port)', () => {
  it('computes indent level for spaces, mixed tabs, and whitespace-only lines', () => {
    expect(computeIndentLevel('', 4)).toBe(-1);
    expect(computeIndentLevel('   \t  ', 4)).toBe(-1);
    expect(computeIndentLevel('A', 4)).toBe(0);
    expect(computeIndentLevel('  A', 4)).toBe(2);
    expect(computeIndentLevel('\tA', 4)).toBe(4);
    expect(computeIndentLevel('  \tA', 4)).toBe(4);
    expect(computeIndentLevel('\t  \tA', 4)).toBe(8);
  });

  it('getLineIndentGuide one level 2', () => {
    assertIndentGuides([
      [0, 2, 4, 1, 'A'],
      [1, 2, 4, 1, '  A'],
      [1, 2, 4, 1, '  A'],
      [1, 2, 4, 1, '  A'],
    ], 2);
  });

  it('getLineIndentGuide two levels', () => {
    assertIndentGuides([
      [0, 2, 5, 1, 'A'],
      [1, 2, 5, 1, '  A'],
      [1, 4, 5, 2, '  A'],
      [2, 4, 5, 2, '    A'],
      [2, 4, 5, 2, '    A'],
    ], 2);
  });

  it('getLineIndentGuide three levels', () => {
    assertIndentGuides([
      [0, 2, 4, 1, 'A'],
      [1, 3, 4, 2, '  A'],
      [2, 4, 4, 3, '    A'],
      [3, 4, 4, 3, '      A'],
      [0, 5, 5, 0, 'A'],
    ], 2);
  });

  it('getLineIndentGuide decreasing indent', () => {
    assertIndentGuides([
      [2, 1, 1, 2, '    A'],
      [1, 1, 1, 2, '  A'],
      [0, 1, 2, 1, 'A'],
    ], 2);
  });

  it('getLineIndentGuide Java', () => {
    assertIndentGuides([
      /* 1*/[0, 2, 9, 1, 'class A {'],
      /* 2*/[1, 3, 4, 2, '  void foo() {'],
      /* 3*/[2, 3, 4, 2, '    console.log(1);'],
      /* 4*/[2, 3, 4, 2, '    console.log(2);'],
      /* 5*/[1, 3, 4, 2, '  }'],
      /* 6*/[1, 2, 9, 1, ''],
      /* 7*/[1, 8, 8, 2, '  void bar() {'],
      /* 8*/[2, 8, 8, 2, '    console.log(3);'],
      /* 9*/[1, 8, 8, 2, '  }'],
      /*10*/[0, 2, 9, 1, '}'],
      /*11*/[0, 12, 12, 1, 'interface B {'],
      /*12*/[1, 12, 12, 1, '  void bar();'],
      /*13*/[0, 12, 12, 1, '}'],
    ], 2);
  });

  it('getLineIndentGuide Javadoc', () => {
    assertIndentGuides([
      [0, 2, 3, 1, '/**'],
      [1, 2, 3, 1, ' * Comment'],
      [1, 2, 3, 1, ' */'],
      [0, 5, 6, 1, 'class A {'],
      [1, 5, 6, 1, '  void foo() {'],
      [1, 5, 6, 1, '  }'],
      [0, 5, 6, 1, '}'],
    ], 2);
  });

  it('getLineIndentGuide Whitespace', () => {
    assertIndentGuides([
      [0, 2, 7, 1, 'class A {'],
      [1, 2, 7, 1, ''],
      [1, 4, 5, 2, '  void foo() {'],
      [2, 4, 5, 2, '    '],
      [2, 4, 5, 2, '    return 1;'],
      [1, 4, 5, 2, '  }'],
      [1, 2, 7, 1, '      '],
      [0, 2, 7, 1, '}']
    ], 2);
  });

  it('getLineIndentGuide Tabs', () => {
    assertIndentGuides([
      [0, 2, 7, 1, 'class A {'],
      [1, 2, 7, 1, '\t\t'],
      [1, 4, 5, 2, '\tvoid foo() {'],
      [2, 4, 5, 2, '\t \t//hello'],
      [2, 4, 5, 2, '\t    return 2;'],
      [1, 4, 5, 2, '  \t}'],
      [1, 2, 7, 1, '      '],
      [0, 2, 7, 1, '}']
    ], 4);
  });

  it('getLineIndentGuide checker.ts', () => {
    assertIndentGuides([
      /* 1*/[0, 1, 1, 0, '/// <reference path="binder.ts"/>'],
      /* 2*/[0, 2, 2, 0, ''],
      /* 3*/[0, 3, 3, 0, '/* @internal */'],
      /* 4*/[0, 5, 16, 1, 'namespace ts {'],
      /* 5*/[1, 5, 16, 1, '    let nextSymbolId = 1;'],
      /* 6*/[1, 5, 16, 1, '    let nextNodeId = 1;'],
      /* 7*/[1, 5, 16, 1, '    let nextMergeId = 1;'],
      /* 8*/[1, 5, 16, 1, '    let nextFlowId = 1;'],
      /* 9*/[1, 5, 16, 1, ''],
      /*10*/[1, 11, 15, 2, '    export function getNodeId(node: Node): number {'],
      /*11*/[2, 12, 13, 3, '        if (!node.id) {'],
      /*12*/[3, 12, 13, 3, '            node.id = nextNodeId;'],
      /*13*/[3, 12, 13, 3, '            nextNodeId++;'],
      /*14*/[2, 12, 13, 3, '        }'],
      /*15*/[2, 11, 15, 2, '        return node.id;'],
      /*16*/[1, 11, 15, 2, '    }'],
      /*17*/[0, 5, 16, 1, '}']
    ], 4);
  });

  it('issue #8425 - Missing indentation lines for first level indentation', () => {
    assertIndentGuides([
      [1, 2, 3, 2, '\tindent1'],
      [2, 2, 3, 2, '\t\tindent2'],
      [2, 2, 3, 2, '\t\tindent2'],
      [1, 2, 3, 2, '\tindent1']
    ], 4);
  });

  it('issue #8952 - Indentation guide lines going through text on .yml file', () => {
    assertIndentGuides([
      [0, 2, 5, 1, 'properties:'],
      [1, 3, 5, 2, '    emailAddress:'],
      [2, 3, 5, 2, '        - bla'],
      [2, 5, 5, 3, '        - length:'],
      [3, 5, 5, 3, '            max: 255'],
      [0, 6, 6, 0, 'getters:']
    ], 4);
  });

  it('issue #11892 - Indent guides look funny', () => {
    assertIndentGuides([
      [0, 2, 7, 1, 'function test(base) {'],
      [1, 3, 6, 2, '\tswitch (base) {'],
      [2, 4, 4, 3, '\t\tcase 1:'],
      [3, 4, 4, 3, '\t\t\treturn 1;'],
      [2, 6, 6, 3, '\t\tcase 2:'],
      [3, 6, 6, 3, '\t\t\treturn 2;'],
      [1, 2, 7, 1, '\t}'],
      [0, 2, 7, 1, '}']
    ], 4);
  });

  it('issue #12398 - Problem in indent guidelines', () => {
    assertIndentGuides([
      [2, 2, 2, 3, '\t\t.bla'],
      [3, 2, 2, 3, '\t\t\tlabel(for)'],
      [0, 3, 3, 0, 'include script']
    ], 4);
  });

  it('issue #49173 - Respects viewport min/max bounds with distance === 1 lookahead', () => {
    const buffer = new PieceTreeTextBuffer([
      'class A {',
      '\tpublic m1(): void {',
      '\t}',
      '\tpublic m2(): void {',
      '\t}',
      '\tpublic m3(): void {',
      '\t}',
      '\tpublic m4(): void {',
      '\t}',
      '\tpublic m5(): void {',
      '\t}',
      '}',
    ].join('\n'), '\n');

    const actual = IndentGuides.getActiveIndentGuide(buffer, 2, 4, 9, { tabSize: 4, indentSize: 4, offSide: false });
    expect(actual).toEqual({ startLineNumber: 2, endLineNumber: 9, indent: 1 });
  });

  it('tweaks - no active / inside scope / scope start / empty line', () => {
    assertIndentGuides([
      [0, 1, 1, 0, 'A'],
      [0, 2, 2, 0, 'A']
    ], 2);

    assertIndentGuides([
      [0, 2, 2, 1, 'A'],
      [1, 2, 2, 1, '  A']
    ], 2);

    assertIndentGuides([
      [0, 2, 2, 1, 'A'],
      [1, 2, 2, 1, '  A'],
      [0, 2, 2, 1, 'A']
    ], 2);

    assertIndentGuides([
      [0, 2, 4, 1, 'A'],
      [1, 2, 4, 1, '  A'],
      [1, 2, 4, 1, ''],
      [1, 2, 4, 1, '  A'],
      [0, 2, 4, 1, 'A']
    ], 2);
  });

  it('offSide rule stops blank line indent guides in Python before next top-level block', () => {
    assertIndentGuides([
      [0, 2, 2, 1, 'def foo():'],
      [1, 2, 2, 1, '    return 1'],
      [0, 2, 2, 1, ''],
      [0, 5, 5, 1, 'def bar():'],
      [1, 5, 5, 1, '    return 2']
    ], 4, true);

    // Same buffer with offSide=false keeps the guide across the blank line
    const pyBuffer = new PieceTreeTextBuffer(
      'def foo():\n    return 1\n\ndef bar():\n    return 2',
      '\n'
    );
    expect(IndentGuides.getLinesIndentGuides(pyBuffer, 1, 5, { tabSize: 4, indentSize: 4, offSide: true })).toEqual([0, 1, 0, 0, 1]);
    expect(IndentGuides.getLinesIndentGuides(pyBuffer, 1, 5, { tabSize: 4, indentSize: 4, offSide: false })).toEqual([0, 1, 1, 0, 1]);

    const registry = LanguageConfigurationRegistry.getInstance();
    expect(registry.getFoldingRules('python')?.offSide).toBe(true);
    expect(registry.getFoldingRules('yaml')?.offSide).toBe(true);
    expect(registry.getFoldingRules('javascript')?.offSide).toBeFalsy();
  });
});

describe('IndentationGuesser (VS Code Port)', () => {
  it('detects 2-space, 4-space, and tab indentation from buffer content', () => {
    const buf2 = new PieceTreeTextBuffer('function a() {\n  if (true) {\n    return 1;\n  }\n}', '\n');
    expect(guessIndentation(buf2, 4, true)).toEqual({ tabSize: 2, insertSpaces: true });

    const buf4 = new PieceTreeTextBuffer('function a() {\n    if (true) {\n        return 1;\n    }\n}', '\n');
    expect(guessIndentation(buf4, 2, true)).toEqual({ tabSize: 4, insertSpaces: true });

    const bufTab = new PieceTreeTextBuffer('function a() {\n\tif (true) {\n\t\treturn 1;\n\t}\n}', '\n');
    expect(guessIndentation(bufTab, 4, true)).toEqual({ tabSize: 4, insertSpaces: false });
  });
});

describe('ViewIndentGuides & EditorView Integration', () => {
  it('renders positioned vertical guide elements and highlights active scope', () => {
    const viewport = new Viewport(20, 8, 8, 2);
    const guidesView = new ViewIndentGuides(viewport);

    const code = [
      'function foo() {',
      '  if (true) {',
      '    return 1;',
      '  }',
      '}'
    ].join('\n');
    const buffer = new PieceTreeTextBuffer(code, '\n');

    // Cursor inside `if` block (line 3 -> active indent level 2 at left = 16px, lines 3..3)
    guidesView.update(1, 5, buffer, 3, { tabSize: 2, indentSize: 2, offSide: false });

    // Lines 1 & 5 have 0 indent guides so no rows are needed
    expect(guidesView.getLineRowElement(1)).toBeUndefined();
    expect(guidesView.getLineRowElement(5)).toBeUndefined();

    // Line 2 has 1 guide (lvl-0 at 0px, inactive)
    const row2 = guidesView.getLineRowElement(2) as unknown as MockElement;
    expect(row2).toBeDefined();
    expect(row2.style.top).toBe('20px');
    expect(row2.style.height).toBe('20px');
    expect(row2.childNodes.length).toBe(1);
    const g2_0 = row2.childNodes[0] as MockElement;
    expect(g2_0.style.left).toBe('0px');
    expect(g2_0.style.width).toBe('8px');
    expect(g2_0.classList.contains('core-guide-indent')).toBe(true);
    expect(g2_0.classList.contains('indent-active')).toBe(false);

    // Line 3 has 2 guides: lvl-0 (0px, inactive) and lvl-1 (16px, indent-active)
    const row3 = guidesView.getLineRowElement(3) as unknown as MockElement;
    expect(row3.childNodes.length).toBe(2);
    const g3_0 = row3.childNodes[0] as MockElement;
    const g3_1 = row3.childNodes[1] as MockElement;
    expect(g3_0.style.left).toBe('0px');
    expect(g3_0.classList.contains('indent-active')).toBe(false);
    expect(g3_1.style.left).toBe('16px');
    expect(g3_1.classList.contains('indent-active')).toBe(true);

    // Move cursor to line 2 (`if (true) {` opens child scope -> line 3 lvl-1 stays active;
    // move cursor to line 1 -> outer scope lines 2..4 lvl-0 becomes active!)
    guidesView.update(1, 5, buffer, 1, { tabSize: 2, indentSize: 2, offSide: false });
    expect((row2.childNodes[0] as MockElement).classList.contains('indent-active')).toBe(true);
    expect((row3.childNodes[0] as MockElement).classList.contains('indent-active')).toBe(true);
    expect((row3.childNodes[1] as MockElement).classList.contains('indent-active')).toBe(false);
  });

  it('integrates with EditorView options, cursor movement, and buffer switching', () => {
    const mount = new MockElement() as unknown as HTMLElement;
    const code = [
      'class Demo {',
      '    run() {',
      '        return 42;',
      '    }',
      '}'
    ].join('\n');
    const buffer = new PieceTreeTextBuffer(code, '\n');

    // Note: JS defaults to tabSize=2 in registry, but guessIndentation detects 4-space indent!
    const editor = new EditorView(mount, buffer, { languageId: 'javascript' });
    expect(editor.getTabSize()).toBe(4);
    expect(editor.getIndentSize()).toBe(4);

    const guidesView = editor.getIndentGuides();
    const row3 = guidesView.getLineRowElement(3) as unknown as MockElement;
    expect(row3).toBeDefined();
    expect(row3.childNodes.length).toBe(2);

    // Cursor at line 1 -> outer scope (lvl-0 across lines 2..4) active
    expect((row3.childNodes[0] as MockElement).classList.contains('indent-active')).toBe(true);
    expect((row3.childNodes[1] as MockElement).classList.contains('indent-active')).toBe(false);

    // Move cursor into `return 42;` on line 3 -> inner scope (lvl-1) becomes active
    editor.setSelection(new Selection(3, 9, 3, 9));
    expect((row3.childNodes[0] as MockElement).classList.contains('indent-active')).toBe(false);
    expect((row3.childNodes[1] as MockElement).classList.contains('indent-active')).toBe(true);

    // Disable highlightActiveIndentation via setGuides
    editor.setGuides({ highlightActiveIndentation: false });
    expect((row3.childNodes[1] as MockElement).classList.contains('indent-active')).toBe(false);

    // Disable indentation guides completely via updateOptions
    editor.updateOptions({ guides: { indentation: false } });
    expect(guidesView.getLineRowElement(3)).toBeUndefined();

    // Re-enable and replace buffer
    editor.updateOptions({ guides: { indentation: true, highlightActiveIndentation: true } });
    editor.setBuffer(new PieceTreeTextBuffer('def f():\n  pass\n', '\n'));
    editor.setLanguage('python');
    expect(editor.getTabSize()).toBe(2);
    const pyRow2 = guidesView.getLineRowElement(2) as unknown as MockElement;
    expect(pyRow2.childNodes.length).toBe(1);
  });

  it('prunes indent guides past horizontal scrollWidth and lines outside viewport', () => {
    const viewport = new Viewport(20, 8, 8, 4);
    const guidesView = new ViewIndentGuides(viewport);
    const buffer = new PieceTreeTextBuffer('            deep()', '\n'); // 3 levels: 0px, 32px, 64px

    guidesView.update(1, 1, buffer, 1, { tabSize: 4, indentSize: 4, offSide: false }, 40);
    const row = guidesView.getLineRowElement(1) as unknown as MockElement;
    expect(row.childNodes.length).toBe(2); // 0px and 32px fit; 64px > 40px is clipped

    const multi = new PieceTreeTextBuffer('  a\n  b\n  c', '\n');
    guidesView.update(2, 3, multi, 2, { tabSize: 2, indentSize: 2, offSide: false });
    expect(guidesView.getLineRowElement(1)).toBeUndefined();
    expect(guidesView.getLineRowElement(2)).toBeDefined();
    expect(guidesView.getLineRowElement(3)).toBeDefined();
  });
});
