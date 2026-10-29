import { describe, expect, it } from 'vitest';
import { dealGroups, groupCount, groupPreview, groupSizes, groupStepperRange, groupsAsText, pickPeople } from './classroom-tools';

/** Deterministic rng (mulberry32) */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

describe('group sizes', () => {
  it('turns a group size into a group count by flooring', () => {
    expect(groupCount(30, 'size', 4)).toBe(7);
    expect(groupCount(30, 'count', 4)).toBe(4);
  });

  it('keeps sizes within one of each other, larger first', () => {
    expect(groupSizes(30, 7)).toEqual([5, 5, 4, 4, 4, 4, 4]);
    expect(groupSizes(12, 4)).toEqual([3, 3, 3, 3]);
  });

  it('describes the result', () => {
    expect(groupPreview(30, 'size', 4)).toBe('7 กลุ่ม · กลุ่มละ 4–5 คน');
    expect(groupPreview(12, 'count', 4)).toBe('4 กลุ่ม · กลุ่มละ 3 คน');
  });

  it('offers 2 up to half the class', () => {
    expect(groupStepperRange(30)).toEqual({ min: 2, max: 15 });
    expect(groupStepperRange(3)).toEqual({ min: 2, max: 2 });
  });
});

describe('dealGroups', () => {
  const people = ids(30).map((id, i) => ({ id, score: 100 - i * 3 }));

  it('uses everyone once with sizes within one', () => {
    const { groups } = dealGroups(people, 7, p => p.score, seeded(1));
    expect(groups.flat().map(p => p.id).sort()).toEqual(people.map(p => p.id).sort());
    expect(groups.map(g => g.length).sort()).toEqual([4, 4, 4, 4, 4, 5, 5]);
  });

  it('mixes strong and weak: group averages stay close to the class average', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { groups, balanced } = dealGroups(people, 6, p => p.score, seeded(seed));
      expect(balanced).toBe(true);
      const means = groups.map(g => g.reduce((s, p) => s + p.score, 0) / g.length);
      expect(Math.max(...means) - Math.min(...means)).toBeLessThanOrEqual(15);
      // every group gets someone from the top fifth and the bottom fifth
      for (const g of groups) {
        expect(g.some(p => p.score >= 85)).toBe(true);
        expect(g.some(p => p.score <= 28)).toBe(true);
      }
    }
  });

  it('gives a different arrangement on another draw', () => {
    const a = dealGroups(people, 6, p => p.score, seeded(1)).groups.map(g => g.map(p => p.id).sort().join());
    const b = dealGroups(people, 6, p => p.score, seeded(2)).groups.map(g => g.map(p => p.id).sort().join());
    expect(a.sort()).not.toEqual(b.sort());
  });

  it('just shuffles when nobody has a score', () => {
    const { groups, balanced } = dealGroups(people, 5, () => null, seeded(3));
    expect(balanced).toBe(false);
    expect(groups.map(g => g.length)).toEqual([6, 6, 6, 6, 6]);
  });

  it('records the deal order for every member', () => {
    const { groups, order } = dealGroups(people, 7, p => p.score, seeded(4));
    expect(order).toHaveLength(30);
    expect(new Set(order.map(([g, i]) => `${g}:${i}`)).size).toBe(30);
    expect(order.every(([g, i]) => groups[g][i] !== undefined)).toBe(true);
  });
});

describe('pickPeople', () => {
  const pool = ids(5);

  it('does not repeat until everyone has been called', () => {
    let called: string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = pickPeople(pool, 1, called, false, seeded(i + 10));
      seen.push(...r.picked);
      called = r.called;
    }
    expect(seen.sort()).toEqual(pool);
    // the next draw starts a new round
    const next = pickPeople(pool, 1, called, false, seeded(99));
    expect(next.called).toEqual(next.picked);
  });

  it('finishes a round and starts the next within one draw, without duplicates', () => {
    const r = pickPeople(pool, 3, ['s1', 's2', 's3', 's4'], false, seeded(7));
    expect(r.picked).toContain('s5');
    expect(new Set(r.picked).size).toBe(3);
    expect(r.called).toHaveLength(2);
  });

  it('allows repeats when asked', () => {
    const r = pickPeople(pool, 2, pool, true, seeded(5));
    expect(r.picked).toHaveLength(2);
  });

  it('ignores called ids that are no longer in the pool and caps at the pool size', () => {
    const r = pickPeople(['a', 'b'], 5, ['x'], false, seeded(6));
    expect(r.picked.sort()).toEqual(['a', 'b']);
  });
});

describe('groupsAsText', () => {
  const p = (name: string, number: string, classroom = 'ม.2/1') => ({ name, number, classroom });

  it('writes a heading and one block per group, members in roll order', () => {
    const text = groupsAsText(
      [[p('ปิยะ', '12'), p('กมล', '3')], [p('ณัฐ', '5'), p('ธนา', '20')]],
      { title: 'ภาษาไทย (ท21101) · ม.2/1', date: new Date(2026, 9, 29) },
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe('จัดกลุ่ม · ภาษาไทย (ท21101) · ม.2/1');
    expect(lines[1]).toMatch(/29 ตุลาคม .*2569 · 4 คน · 2 กลุ่ม$/);
    expect(lines[2]).toBe('');
    expect(lines.slice(3, 6)).toEqual(['กลุ่ม 1 (2 คน)', 'เลขที่ 3  กมล', 'เลขที่ 12  ปิยะ']);
    expect(lines[6]).toBe('');
    expect(lines.slice(7)).toEqual(['กลุ่ม 2 (2 คน)', 'เลขที่ 5  ณัฐ', 'เลขที่ 20  ธนา']);
  });

  it('puts the room first when rooms are mixed', () => {
    const text = groupsAsText([[p('ข้าว', '2', 'ม.2/2'), p('ดาว', '9', 'ม.2/1')]], { title: 'x', showRoom: true });
    expect(text.split('\n').slice(3)).toEqual(['กลุ่ม 1 (2 คน)', 'ม.2/1  เลขที่ 9  ดาว', 'ม.2/2  เลขที่ 2  ข้าว']);
  });
});
