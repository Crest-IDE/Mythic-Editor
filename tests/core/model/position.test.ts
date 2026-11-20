import { describe, it, expect } from 'vitest';
import { Position } from '@mythic/core/model/Position';

describe('Position Model', () => {
  it('enforces 1-based indexing invariants', () => {
    const posZero = new Position(0, 0);
    expect(posZero.lineNumber).toBe(1);
    expect(posZero.column).toBe(1);

    const posNegative = new Position(-5, -10);
    expect(posNegative.lineNumber).toBe(1);
    expect(posNegative.column).toBe(1);

    const posFloat = new Position(2.7, 3.2);
    expect(posFloat.lineNumber).toBe(2);
    expect(posFloat.column).toBe(3);
  });

  it('correctly compares positions with compare() and equals()', () => {
    const p1 = new Position(1, 1);
    const p2 = new Position(1, 5);
    const p3 = new Position(2, 1);
    const p1Clone = new Position(1, 1);

    expect(p1.equals(p1Clone)).toBe(true);
    expect(p1.equals(p2)).toBe(false);

    expect(Position.compare(p1, p2)).toBeLessThan(0);
    expect(Position.compare(p2, p3)).toBeLessThan(0);
    expect(Position.compare(p3, p2)).toBeGreaterThan(0);
    expect(Position.compare(p1, p1Clone)).toBe(0);
  });

  it('evaluates isBefore and isBeforeOrEqual', () => {
    const p1 = new Position(2, 3);
    const p2 = new Position(2, 5);
    const p3 = new Position(3, 1);

    expect(p1.isBefore(p2)).toBe(true);
    expect(p2.isBefore(p1)).toBe(false);
    expect(p1.isBefore(p1)).toBe(false);

    expect(p1.isBeforeOrEqual(p1)).toBe(true);
    expect(p1.isBeforeOrEqual(p2)).toBe(true);
    expect(p2.isBefore(p3)).toBe(true);
  });

  it('supports with() and delta() immutability', () => {
    const p = new Position(5, 10);
    const withLine = p.with(7);
    expect(withLine.lineNumber).toBe(7);
    expect(withLine.column).toBe(10);

    const deltaP = p.delta(2, -3);
    expect(deltaP.lineNumber).toBe(7);
    expect(deltaP.column).toBe(7);

    // Clamping on negative delta
    const clampedDelta = p.delta(-10, -20);
    expect(clampedDelta.lineNumber).toBe(1);
    expect(clampedDelta.column).toBe(1);
  });
});
