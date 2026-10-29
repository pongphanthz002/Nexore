/**
 * A small 2D physics world for the gacha machine (no library): capsules are discs with gravity,
 * air drag, bouncy collisions with each other and with the round dome wall, and spin that comes
 * from rolling against the wall (no slip). While the crank turns, a stirring force tumbles them.
 * A released capsule is pulled to the hole at the bottom of the dome and falls out; the tray
 * world catches it, lets it bounce on the floor and roll to a stop.
 *
 * Units are pixels and seconds, with the forces scaled to the dome size so a bigger machine
 * behaves the same, only larger. Pure code: the component draws the bodies every frame.
 */

export type Rng = () => number;

export interface Body {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** rotation (radians, clockwise on screen) and its speed */
  a: number;
  w: number;
}

const SUBSTEPS = 4;
const ITERATIONS = 3;

/** Bounciness: a fast hit keeps this share of its speed; slow contacts don't bounce (no jitter). */
const WALL_BOUNCE = 0.5;
const BALL_BOUNCE = 0.55;

function bounceFor(speed: number, slow: number, e: number) {
  return speed > slow ? e : 0;
}

export class DomeWorld {
  balls: Body[] = [];
  /** 0…1: how hard the crank is stirring (tumbling force) */
  stir = 0;
  private released = new Map<string, number>();
  /** position at the start of the current substep, per capsule */
  private prev = new Map<string, { x: number; y: number }>();

  constructor(public radius: number, private rng: Rng = Math.random) {}

  private get size() { return this.radius * 2; }
  /** Gravity: a capsule falls the dome's height in about 0.55 s. */
  private get gravity() { return 6.5 * this.size; }

  /** Drops a capsule in from the top of the dome (or at a given spot). */
  add(id: string, r: number, at?: { x: number; y: number }) {
    if (this.balls.some(b => b.id === id)) return;
    const R = this.radius;
    const spread = Math.max(0, R - r - 4) * 0.7;
    this.balls.push({
      id,
      r,
      x: at?.x ?? R + (this.rng() * 2 - 1) * spread,
      y: at?.y ?? R - (R - r) * (0.55 + this.rng() * 0.35),
      vx: (this.rng() - 0.5) * this.size * 0.6,
      vy: this.rng() * this.size * 0.3,
      a: this.rng() * Math.PI * 2,
      w: (this.rng() - 0.5) * 6,
    });
  }

  remove(id: string) {
    this.balls = this.balls.filter(b => b.id !== id);
    this.released.delete(id);
    this.prev.delete(id);
  }

  has(id: string) {
    return this.balls.some(b => b.id === id);
  }

  /** Lets a capsule through the hole at the bottom and pulls it there. */
  release(id: string) {
    if (this.has(id)) this.released.set(id, 0);
  }

  isReleasing(id: string) {
    return this.released.has(id);
  }

  /** New dome size: everything scales with it. */
  resize(radius: number, r: number) {
    const k = radius / this.radius;
    if (!Number.isFinite(k) || k <= 0) return;
    for (const b of this.balls) {
      b.x *= k; b.y *= k; b.vx *= k; b.vy *= k; b.r = r;
    }
    this.radius = radius;
  }

  /** Fastest capsule (px/s): the component stops drawing once everything rests. */
  maxSpeed() {
    return this.balls.reduce((m, b) => Math.max(m, Math.hypot(b.vx, b.vy)), 0);
  }

  get busy() {
    return this.stir > 0 || this.released.size > 0;
  }

  /**
   * Advances the world; returns the capsules that left through the hole.
   *
   * Position-based: each substep moves the capsules, pushes overlapping ones apart and back inside
   * the glass, takes the velocity from where they ended up (so resting piles stay still), then
   * gives fast hits their bounce back and lets the glass make them roll.
   */
  step(dt: number): Body[] {
    const out: Body[] = [];
    const h = Math.min(dt, 1 / 30) / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.integrate(h);
      const pairs: Contact[] = [];
      const walls: WallContact[] = [];
      for (let k = 0; k < ITERATIONS; k++) {
        this.solveBalls(k === 0 ? pairs : null);
        this.solveWall(k === 0 ? walls : null, out);
      }
      this.updateVelocities(h, pairs, walls);
    }
    return out;
  }

  private integrate(h: number) {
    const R = this.radius;
    const D = this.size;
    const g = this.gravity;
    const maxV = 7 * D;
    for (const b of this.balls) {
      let ax = 0;
      let ay = g;
      const dx = b.x - R;
      const dy = b.y - R;
      const dist = Math.hypot(dx, dy) || 1;

      if (this.stir > 0) {
        // The paddles at the bottom swirl the capsules round and throw the low ones up
        ax += (-dy / dist) * 9 * D * this.stir;
        ay += (dx / dist) * 9 * D * this.stir;
        if (dy > -R * 0.2) ay -= 15 * D * this.stir * (0.6 + 0.8 * this.rng()) * Math.min(1, (dy + R * 0.2) / R + 0.3);
        ax += (this.rng() - 0.5) * 16 * D * this.stir;
      }

      const t = this.released.get(b.id);
      if (t !== undefined) {
        this.released.set(b.id, t + h);
        // Drawn to the hole like the turning disc would carry it there
        const hx = R - b.x;
        const hy = R * 2 + b.r - b.y;
        const hd = Math.hypot(hx, hy) || 1;
        ax += (hx / hd) * 14 * D;
        ay += (hy / hd) * 8 * D;
      }

      b.vx += ax * h;
      b.vy += ay * h;
      const drag = 1 - 0.5 * h;
      b.vx *= drag;
      b.vy *= drag;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > maxV) {
        b.vx *= maxV / speed;
        b.vy *= maxV / speed;
      }
      this.prev.set(b.id, { x: b.x, y: b.y });
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
  }

  private solveBalls(record: Contact[] | null) {
    const list = this.balls;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const q = list[j];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const min = p.r + q.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = d2 ? dx / d : 1;
        const ny = d2 ? dy / d : 0;
        // Push apart (equal masses share the correction)
        const push = (min - d) / 2;
        p.x -= nx * push; p.y -= ny * push;
        q.x += nx * push; q.y += ny * push;
        record?.push({ p, q, nx, ny, vn: (q.vx - p.vx) * nx + (q.vy - p.vy) * ny });
      }
    }
  }

  private solveWall(record: WallContact[] | null, out: Body[]) {
    const R = this.radius;
    for (const b of [...this.balls]) {
      const dx = b.x - R;
      const dy = b.y - R;
      const d = Math.hypot(dx, dy) || 1;
      const t = this.released.get(b.id);

      if (t !== undefined) {
        // Through the hole: gone once it is below the dome, or after a moment if it got stuck
        if (b.y - b.r > R * 2 - b.r * 0.2 || t > 2.4) {
          this.remove(b.id);
          out.push(b);
          continue;
        }
        const holeHalf = Math.asin(Math.min(1, (b.r * 1.3) / R));
        if (dy > 0 && Math.abs(Math.atan2(dx, dy)) < holeHalf) continue;
      }

      const limit = R - b.r;
      if (d <= limit) continue;
      const nx = dx / d;
      const ny = dy / d;
      b.x = R + nx * limit;
      b.y = R + ny * limit;
      record?.push({ b, nx, ny, vn: b.vx * nx + b.vy * ny });
    }
  }

  private updateVelocities(h: number, pairs: Contact[], walls: WallContact[]) {
    const slow = 0.25 * this.size;
    for (const b of this.balls) {
      const from = this.prev.get(b.id);
      if (!from) continue;
      b.vx = (b.x - from.x) / h;
      b.vy = (b.y - from.y) / h;
    }
    // Bounce: a fast hit leaves with part of the speed it came in with
    for (const c of pairs) {
      if (!this.has(c.p.id) || !this.has(c.q.id)) continue;
      const now = (c.q.vx - c.p.vx) * c.nx + (c.q.vy - c.p.vy) * c.ny;
      if (c.vn < -slow) {
        const dv = (-BALL_BOUNCE * c.vn - now) / 2;
        c.p.vx -= c.nx * dv; c.p.vy -= c.ny * dv;
        c.q.vx += c.nx * dv; c.q.vy += c.ny * dv;
      }
      // Rubbing: some of the sliding turns into spin, opposite ways
      const vt = (c.q.vx - c.p.vx) * -c.ny + (c.q.vy - c.p.vy) * c.nx;
      c.p.w += (vt / c.p.r) * 0.12;
      c.q.w += (vt / c.q.r) * 0.12;
    }
    for (const c of walls) {
      const { b, nx, ny } = c;
      if (!this.has(b.id)) continue;
      const now = b.vx * nx + b.vy * ny;
      if (c.vn > slow) {
        const dv = -WALL_BOUNCE * c.vn - now;
        b.vx += nx * dv;
        b.vy += ny * dv;
      }
      // Rolling on the glass: spin follows the sliding speed (no slip), with a little friction
      const tx = -ny;
      const ty = nx;
      const vt = b.vx * tx + b.vy * ty;
      b.w += (-vt / b.r - b.w) * 0.4;
      b.vx -= tx * vt * 0.02;
      b.vy -= ty * vt * 0.02;
    }
    for (const b of this.balls) {
      // Nearly still capsules come to rest instead of shivering
      if (this.stir === 0 && !this.released.has(b.id) && Math.hypot(b.vx, b.vy) < 0.05 * this.size) {
        b.vx *= 0.85;
        b.vy *= 0.85;
      }
      b.w *= 1 - 0.8 * h;
      b.a += b.w * h;
    }
  }
}

interface Contact { p: Body; q: Body; nx: number; ny: number; vn: number }
interface WallContact { b: Body; nx: number; ny: number; vn: number }

/**
 * The catch tray under the machine: one capsule drops in from the chute at the top left, bounces
 * on the floor, knocks the far wall and rolls to a stop.
 */
export class TrayWorld {
  ball: Body | null = null;
  private age = 0;
  private still = 0;

  constructor(public width: number, public height: number) {}

  private get gravity() { return 13 * this.height; }

  drop(id: string, r: number) {
    this.age = 0;
    this.still = 0;
    this.ball = {
      id, r,
      x: r + 2,
      y: -r,
      vx: this.width * 2.2,
      vy: this.height * 1.5,
      a: 0,
      w: 8,
    };
  }

  clear() {
    this.ball = null;
  }

  /** True once the capsule has come to rest (or after a while, so a reveal never waits long). */
  get settled() {
    return !!this.ball && (this.still > 0.18 || this.age > 1.6);
  }

  step(dt: number) {
    const b = this.ball;
    if (!b) return;
    const h = Math.min(dt, 1 / 30) / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.age += h;
      b.vy += this.gravity * h;
      b.vx *= 1 - 0.4 * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      const floor = this.height - b.r;
      const slow = this.height * 0.9;
      if (b.y > floor) {
        b.y = floor;
        if (b.vy > 0) b.vy = -b.vy * bounceFor(b.vy, slow, 0.52);
        // Rolling on the floor: spin matches the speed, and rolling friction slows it down
        b.vx *= 1 - 2.2 * h;
        b.w += (b.vx / b.r - b.w) * 0.5;
      }
      if (b.x < b.r) {
        b.x = b.r;
        if (b.vx < 0) b.vx = -b.vx * 0.5;
      } else if (b.x > this.width - b.r) {
        b.x = this.width - b.r;
        if (b.vx > 0) b.vx = -b.vx * 0.5;
      }
      b.a += b.w * h;
      const resting = b.y >= floor - 0.5 && Math.abs(b.vy) < 1 && Math.abs(b.vx) < this.width * 0.15;
      this.still = resting ? this.still + h : 0;
    }
  }
}
