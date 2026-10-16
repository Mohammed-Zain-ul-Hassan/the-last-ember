import { describe, expect, it } from 'vitest';
import { bestFor, gradeFor, recordBest } from './settings';

describe('grades and bests', () => {
  it('grades by wounds, and by the fire left on the hearth grounds', () => {
    expect(gradeFor(0, null)).toBe('S');
    expect(gradeFor(44, null)).toBe('A');
    expect(gradeFor(120, null)).toBe('B');
    expect(gradeFor(300, null)).toBe('C');
    expect(gradeFor(0, 30)).toBe('B'); // untouched, but the hearth nearly went out
  });

  it('keeps only the better result', () => {
    expect(recordBest('t', { grade: 'B', wounds: 100, time: 60 })).toBe(true);
    expect(recordBest('t', { grade: 'C', wounds: 200, time: 50 })).toBe(false);
    expect(recordBest('t', { grade: 'B', wounds: 80, time: 70 })).toBe(true);
    expect(recordBest('t', { grade: 'S', wounds: 0, time: 90 })).toBe(true);
    expect(bestFor('t')?.grade).toBe('S');
  });
});
