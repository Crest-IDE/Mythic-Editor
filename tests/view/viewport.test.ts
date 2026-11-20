import { describe, it, expect } from 'vitest';
import { Viewport } from '@mythic/view/Viewport';

describe('Viewport & Virtualization Coordinates', () => {
  const lineHeight = 20;
  const charWidth = 8;
  const viewport = new Viewport(lineHeight, charWidth);

  it('calculates visible lines with overscan', () => {
    viewport.setDimensions(800, 200); // 10 lines fit in 200px (200 / 20 = 10)
    viewport.scrollTop = 0;
    viewport.overscanLines = 2;

    const visible = viewport.getVisibleLines(100);
    // first visible: 1, last visible: 10
    // with overscan: startLineNumber = max(1, 1 - 2) = 1, endLineNumber = min(100, 10 + 2) = 12
    expect(visible.startLineNumber).toBe(1);
    expect(visible.endLineNumber).toBe(12);

    // Scroll down 400px (line 21)
    viewport.scrollTop = 400; // 400 / 20 = 20 -> first visible line 21
    const scrolledVisible = viewport.getVisibleLines(100);
    // first visible: 21, last visible: 30
    // with overscan: start = 21 - 2 = 19, end = 30 + 2 = 32
    expect(scrolledVisible.startLineNumber).toBe(19);
    expect(scrolledVisible.endLineNumber).toBe(32);
  });

  it('clamps visible lines at document boundaries', () => {
    viewport.setDimensions(800, 400);
    viewport.scrollTop = 5000;

    const visible = viewport.getVisibleLines(50);
    expect(visible.endLineNumber).toBe(50);
  });

  it('computes line top pixel offset', () => {
    expect(viewport.getLineTop(1)).toBe(0);
    expect(viewport.getLineTop(2)).toBe(20);
    expect(viewport.getLineTop(10)).toBe(180);
  });

  it('computes column left pixel offset', () => {
    expect(viewport.getColumnLeft(1)).toBe(0);
    expect(viewport.getColumnLeft(2)).toBe(8);
    expect(viewport.getColumnLeft(11)).toBe(80);
  });

  it('maps pixel coordinates back to line and column (hit testing)', () => {
    // Y = 35 -> line 2 (line 1 is 0..19, line 2 is 20..39)
    expect(viewport.getLineNumberAtY(35, 10)).toBe(2);

    // X = 16 -> column 3 (col 1 is 0, col 2 is 8, col 3 is 16)
    expect(viewport.getColumnAtX(16, 20)).toBe(3);

    // Clamps column to line length + 1 (end of line cursor position)
    expect(viewport.getColumnAtX(500, 10)).toBe(11);
  });

  it('computes Monaco-grounded gutterWidth and line decorations gap', () => {
    // charWidth is 8, lineNumbersMinChars is 5, lineDecorationsWidth is 26 (10px base + 16px folding slot)
    // For small document (< 100,000 lines), digitCount clamps to 5
    // gutterWidth = 5 * 8 + 26 = 66px
    expect(viewport.computeGutterWidth(1)).toBe(66);
    expect(viewport.computeGutterWidth(100)).toBe(66);
    expect(viewport.computeGutterWidth(99999)).toBe(66);

    // 6-digit document (100,000 lines):
    // gutterWidth = 6 * 8 + 26 = 74px
    expect(viewport.computeGutterWidth(100000)).toBe(74);
  });
});
