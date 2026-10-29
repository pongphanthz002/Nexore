import { describe, expect, it } from 'vitest';
import { DomeWorld, TrayWorld } from './gacha-physics';

function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const run = (world: DomeWorld, seconds: number) => {
  const out = [];
  for (let t = 0; t < seconds; t += 1 / 60) out.push(...world.step(1 / 60));
  return out;
};

function filled(n = 28, R = 140, seed = 1) {
  const world = new DomeWorld(R, seeded(seed));
  for (let i = 0; i < n; i++) world.add(`s${i}`, 16);
  return world;
}

describe('DomeWorld', () => {
  it('settles every capsule inside the dome, piled at the bottom, without deep overlaps', () => {
    const world = filled();
    run(world, 4);
    const R = world.radius;
    for (const b of world.balls) {
      expect(Math.hypot(b.x - R, b.y - R)).toBeLessThanOrEqual(R - b.r + 0.5);
      expect(b.y).toBeGreaterThan(R * 0.8);
    }
    for (let i = 0; i < world.balls.length; i++) {
      for (let j = i + 1; j < world.balls.length; j++) {
        const p = world.balls[i];
        const q = world.balls[j];
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan((p.r + q.r) * 0.85);
      }
    }
    expect(world.maxSpeed()).toBeLessThan(world.radius * 0.3);
  });

  it('tumbles the capsules while the crank turns', () => {
    const world = filled();
    run(world, 3);
    const before = world.balls.reduce((s, b) => s + b.y, 0) / world.balls.length;
    world.stir = 1;
    run(world, 0.6);
    const during = world.balls.reduce((s, b) => s + b.y, 0) / world.balls.length;
    expect(during).toBeLessThan(before - 10);
    world.stir = 0;
    run(world, 4);
    expect(world.balls).toHaveLength(28);
  });

  it('lets a released capsule out through the bottom, and only that one', () => {
    const world = filled();
    run(world, 3);
    world.release('s5');
    const out = run(world, 3);
    expect(out.map(b => b.id)).toEqual(['s5']);
    expect(world.has('s5')).toBe(false);
    expect(world.balls).toHaveLength(27);
  });

  it('scales with the dome size', () => {
    const world = filled(10, 100);
    run(world, 2);
    world.resize(200, 32);
    for (const b of world.balls) expect(Math.hypot(b.x - 200, b.y - 200)).toBeLessThanOrEqual(200 - 32 + 2);
  });
});

describe('TrayWorld', () => {
  it('drops a capsule in, bounces it and lets it come to rest on the floor', () => {
    const tray = new TrayWorld(96, 96);
    tray.drop('s1', 26);
    let bounced = false;
    let lastVy = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      tray.step(1 / 60);
      const vy = tray.ball!.vy;
      if (lastVy > 0 && vy < 0) bounced = true;
      lastVy = vy;
    }
    expect(bounced).toBe(true);
    expect(tray.settled).toBe(true);
    expect(tray.ball!.y).toBeCloseTo(96 - 26, 0);
    expect(tray.ball!.x).toBeGreaterThanOrEqual(26);
    expect(tray.ball!.x).toBeLessThanOrEqual(70);
  });
});
