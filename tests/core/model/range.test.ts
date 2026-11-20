import { describe, it, expect } from 'vitest';
import { Range } from '@mythic/core/model/Range';
import { Position } from '@mythic/core/model/Position';

describe('Range Model', () => {
  it('normalizes reversed ranges automatically', () => {
    // End is before start
    const reversed = new Range(3, 5, 1, 2);
    expect(reversed.startLineNumber).toBe(1);
    expect(reversed.startColumn).toBe(2);
    expect(reversed.endLineNumber).toBe(3);
    expect(reversed.endColumn).toBe(5);

    // Same line, reversed columns
    const sameLineReversed = new Range(2, 10, 2, 4);
    expect(sameLineReversed.startLineNumber).toBe(2);
    expect(sameLineReversed.startColumn).toBe(4);
    expect(sameLineReversed.endLineNumber).toBe(2);
    expect(sameLineReversed.endColumn).toBe(10);
  });

  it('correctly identifies empty (collapsed) ranges', () => {
    const emptyRange = new Range(2, 5, 2, 5);
    expect(emptyRange.isEmpty()).toBe(true);

    const nonEmptyRange = new Range(2, 5, 2, 6);
    expect(nonEmptyRange.isEmpty()).toBe(false);
  });

  it('determines if a position is contained within the range', () => {
    const r = new Range(2, 3, 4, 8);

    // Boundary edge cases (inclusive)
    expect(r.containsPosition(new Position(2, 3))).toBe(true);
    expect(r.containsPosition(new Position(4, 8))).toBe(true);

    // Inside
    expect(r.containsPosition(new Position(3, 1))).toBe(true);
    expect(r.containsPosition(new Position(3, 50))).toBe(true);
    expect(r.containsPosition(new Position(2, 10))).toBe(true);
    expect(r.containsPosition(new Position(4, 5))).toBe(true);

    // Outside
    expect(r.containsPosition(new Position(1, 10))).toBe(false);
    expect(r.containsPosition(new Position(2, 2))).toBe(false);
    expect(r.containsPosition(new Position(4, 9))).toBe(false);
    expect(r.containsPosition(new Position(5, 1))).toBe(false);
  });

  it('tests range containment and intersection', () => {
    const outer = new Range(1, 1, 10, 1);
    const inner = new Range(2, 5, 5, 10);
    const overlapping = new Range(8, 1, 12, 5);
    const disjoint = new Range(15, 1, 20, 1);

    expect(outer.containsRange(inner)).toBe(true);
    expect(inner.containsRange(outer)).toBe(false);

    expect(Range.areIntersecting(outer, overlapping)).toBe(true);
    expect(Range.areIntersecting(outer, disjoint)).toBe(false);

    const intersection = Range.intersectRanges(outer, overlapping);
    expect(intersection).not.toBeNull();
    expect(intersection?.startLineNumber).toBe(8);
    expect(intersection?.startColumn).toBe(1);
    expect(intersection?.endLineNumber).toBe(10);
    expect(intersection?.endColumn).toBe(1);
  });

  it('checks single-line property', () => {
    expect(new Range(1, 1, 1, 10).isSingleLine()).toBe(true);
    expect(new Range(1, 1, 2, 1).isSingleLine()).toBe(false);
  });
});
