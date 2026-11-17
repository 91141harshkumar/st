'use strict';
const W = 1280, H = 720, T = 40;
const COLORS = ['#59d9ff', '#ff9e40'];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const inter = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const grow = (a, g) => ({ x: a.x - g, y: a.y - g, w: a.w + 2 * g, h: a.h + 2 * g });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sgn = v => v > 0 ? 1 : v < 0 ? -1 : 0;

// ============================================================ procedural room
// kind: 0 outer shell, 1 platform, 2 pillar.  Same seed -> same room on both peers.
function genRoom(seed) {
  const r = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const rf = (a, b) => a + r() * (b - a);
  const rects = [];
  const add = (x, y, w, h, k) => rects.push({ x, y, w, h, k });
  add(0, H - T, W, T, 0); add(0, 0, W, T, 0); add(0, T, T, H - 2 * T, 0); add(W - T, T, T, H - 2 * T, 0);
  const free = a => rects.every(q => q.k === 0 || !inter(q, a));

  let placed = 0, tries = 0, want = ri(3, 5);
  while (placed < want && tries++ < 120) {
    const w = ri(2, 4) * 12, h = ri(170, 400), x = ri(230, W - 230 - w);
    const ceil = r() < 0.4, y = ceil ? T : H - T - h;
    const rc = { x, y, w, h };
    if (free(grow(rc, 130))) { add(x, y, w, h, 2); placed++; }
  }

  const nearWall = rc => {
    if (rc.x - T < 110 || (W - T) - (rc.x + rc.w) < 110) return true;
    return rects.some(p => {
      if (p.k !== 2) return false;
      const gap = Math.max(p.x - (rc.x + rc.w), rc.x - (p.x + p.w));
      return gap < 110 && rc.y > p.y - 20 && rc.y < p.y + p.h + 20;
    });
  };
  placed = 0; tries = 0; want = ri(4, 7);
  while (placed < want && tries++ < 300) {
    const w = ri(100, 260), x = ri(T + 20, W - T - 20 - w), y = ri(170, 560);
    const rc = { x, y, w, h: 18 };
    if (!free(grow(rc, 70)) || !nearWall(rc)) continue;
    add(x, y, w, 18, 1); placed++;
  }

  const decor = [], dust = [];
  for (let i = ri(5, 9); i > 0; i--) {
    const dw = ri(80, 240), dh = ri(60, 220);
    decor.push({ x: rf(T, W - T - dw), y: rf(T, H - T - dh), w: dw, h: dh });
  }
  for (let i = 0; i < 60; i++) dust.push({ x: rf(T, W - T), y: rf(T, H - T) });
  return { seed, rects, decor, dust, spawns: [{ x: 110, y: H - T - 33 }, { x: W - 110, y: H - T - 33 }] };
}

// ============================================================ game
const SPEED = 210, ACCEL = 2200, AIR_ACCEL = 1100, FRICTION = 2600, GRAV = 1500;
const JUMP_V = -540, MAX_FALL = 900, CLIMB = 120, MAX_HP = 5, HW = 7, HH = 33;

class Game {
  constructor(onEvent) {
    this.onEvent = onEvent || (() => {});
    this.players = [this.mkPlayer(0), this.mkPlayer(1)];
    this.bullets = []; this.sparks = []; this.scores = [0, 0];
    this.room = null;
  }
  mkPlayer(id) {
    return { id, color: COLORS[id], x: 0, y: 0, vx: 0, vy: 0, facing: 1, climbing: false, ws: 0,
      ax: 1, ay: 0, recoil: 0, firing: 0, flash: 0, dead: false, hp: MAX_HP, floor: false,
      aimY: 0, wallT: 0, coyote: 0, jbuf: 0, jprev: false, fireCd: 0, regrab: 0, respT: 0, alpha: 1,
      in: { mx: 0, my: 0, j: false, s: false }, rig: null };
  }
  newRoom(seed) {
    this.room = genRoom(seed);
    this.bullets = []; this.sparks = [];
    this.players.forEach((p, i) => { p.sx = this.room.spawns[i].x; p.sy = this.room.spawns[i].y; this.respawn(p, true); });
  }
  respawn(p, silent) {
    p.x = p.sx; p.y = p.sy; p.vx = p.vy = 0; p.hp = MAX_HP; p.dead = false; p.climbing = false; p.alpha = 1;
    p.facing = p.sx < W / 2 ? 1 : -1; p.ax = p.facing; p.ay = 0;
    rigReset(p);
    if (!silent) this.ev('spawn', p.x);
  }
  ev(name, x, extra) { this.onEvent(name, x, extra); }

  hits(x, y) {                       // does a player box at (x,y) overlap solid geometry?
    const b = { x: x - HW, y: y - HH, w: HW * 2, h: HH * 2 };
    for (const q of this.room.rects) if (inter(b, q)) return q;
    return null;
  }

  step(dt) {
    for (const p of this.players) this.stepPlayer(p, dt);
    this.stepBullets(dt);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]; s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.92; s.vy = s.vy * 0.92 + 500 * dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
  }

  stepPlayer(p, dt) {
    p.fireCd = Math.max(p.fireCd - dt, 0); p.firing = Math.max(p.firing - dt, 0);
    p.recoil = Math.max(p.recoil - dt * 5, 0); p.flash = Math.max(p.flash - dt, 0);
    p.regrab = Math.max(p.regrab - dt, 0);
    if (p.dead) {
      p.respT -= dt; p.alpha = clamp(p.respT / 0.8, 0, 1);
      if (p.respT <= 0) { this.respawn(p); return; }
    }
    const mi = p.dead ? { mx: 0, my: 0 } : p.in;
    const jumpPressed = p.in.j && !p.jprev && !p.dead; p.jprev = p.in.j;

    // contact probes (replace Godot's is_on_wall / is_on_floor)
    const wallR = !!this.hits(p.x + 1, p.y), wallL = !!this.hits(p.x - 1, p.y);
    const wasFloor = p.floor;
    p.floor = !!this.hits(p.x, p.y + 1);
    if (wallR || wallL) { p.ws = wallR ? 1 : -1; p.wallT = 0.12; } else p.wallT = Math.max(p.wallT - dt, 0);
    p.coyote = p.floor ? 0.1 : Math.max(p.coyote - dt, 0);
    p.jbuf = jumpPressed ? 0.12 : Math.max(p.jbuf - dt, 0);
    if (p.floor && !wasFloor && p.vy > 250) this.ev('land', p.x);

    if (!p.dead) {
      if (!p.climbing) {
        const grab = p.wallT > 0 && p.ws !== 0 && p.regrab <= 0 && mi.mx * p.ws > 0.4 && (!p.floor || mi.my < -0.4);
        if (grab) { p.climbing = true; p.vy *= 0.2; this.ev('grab', p.x); }
      } else if (p.jbuf > 0) {
        p.vx = -p.ws * 360; p.vy = -500; p.climbing = false; p.regrab = 0.3; p.jbuf = 0; p.facing = -p.ws;
        this.ev('walljump', p.x);
      } else if (mi.mx * p.ws < -0.6) { p.climbing = false; p.regrab = 0.2; }
      else if (p.floor && mi.my > 0.2) p.climbing = false;
      else if (p.wallT <= 0) {                       // reached the top: mantle over
        p.climbing = false;
        if (p.vy < -30) { p.vx = p.ws * 150; p.vy = -280; }
      }
    }

    if (p.climbing) {
      p.facing = -p.ws; p.vx = p.ws * 60;
      p.vy = moveToward(p.vy, mi.my * CLIMB, 1800 * dt);
    } else {
      if (Math.abs(mi.mx) > 0.2) p.facing = sgn(mi.mx);
      const acc = p.floor ? (Math.abs(mi.mx) > 0.1 ? ACCEL : FRICTION) : AIR_ACCEL;
      p.vx = moveToward(p.vx, mi.mx * SPEED, acc * dt);
      p.vy = Math.min(p.vy + GRAV * dt, MAX_FALL);
      if (p.jbuf > 0 && p.coyote > 0) { p.vy = JUMP_V; p.jbuf = 0; p.coyote = 0; this.ev('jump', p.x); }
      if (!p.in.j && p.vy < -200) p.vy += GRAV * 1.2 * dt;
    }

    const aimT = p.climbing ? 0 : mi.my;
    p.aimY = lerp(p.aimY, aimT, 1 - Math.exp(-14 * dt));
    const ang = p.facing * p.aimY * 0.9;
    const bx = p.facing, c = Math.cos(ang), s = Math.sin(ang);
    p.ax = bx * c; p.ay = bx * s;

    if (p.in.s && p.fireCd <= 0 && !p.dead) this.fire(p);

    // move + collide, one axis at a time
    p.x += p.vx * dt;
    let q = this.hits(p.x, p.y);
    if (q) { p.x = p.vx > 0 ? q.x - HW : q.x + q.w + HW; if (!p.climbing) p.vx = 0; }
    p.y += p.vy * dt;
    q = this.hits(p.x, p.y);
    if (q) {
      if (p.vy > 0) p.y = q.y - HH; else p.y = q.y + q.h + HH;
      p.vy = 0;
    }
    rigStep(p, dt);
  }

  fire(p) {
    p.fireCd = 0.17; p.firing = 0.3; p.recoil = 1;
    this.bullets.push({ x: p.rig.mz.x, y: p.rig.mz.y, vx: p.ax * 1100, vy: p.ay * 1100, owner: p.id, life: 1.2 });
    if (!p.climbing) { p.vx -= p.ax * 25; }
    this.ev('shoot', p.x);
  }

  stepBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      const dx = b.vx * dt, dy = b.vy * dt;
      let best = 2, hitP = null, nx = 0, ny = 0;
      for (const q of this.room.rects) {
        const r = segBox(b.x, b.y, dx, dy, q.x, q.y, q.w, q.h);
        if (r && r.t < best) { best = r.t; nx = r.nx; ny = r.ny; hitP = null; }
      }
      for (const p of this.players) {
        if (p.id === b.owner || p.dead) continue;
        const r = segBox(b.x, b.y, dx, dy, p.x - HW, p.y - HH, HW * 2, HH * 2);
        if (r && r.t < best) { best = r.t; nx = r.nx; ny = r.ny; hitP = p; }
      }
      if (best <= 1) {
        const hx = b.x + dx * best, hy = b.y + dy * best;
        const len = Math.hypot(b.vx, b.vy) || 1;
        if (hitP) this.takeHit(hitP, b.vx / len, b.vy / len, b.owner);
        else this.ev('wall', hx);
        this.burst(hx, hy, nx, ny, hitP ? hitP.color : COLORS[b.owner], 8);
        this.bullets.splice(i, 1);
      } else if (b.life <= 0) this.bullets.splice(i, 1);
      else { b.x += dx; b.y += dy; }
    }
  }

  takeHit(p, dx, dy, owner) {
    if (p.dead) return;
    p.hp--; p.flash = 0.15; p.vx += dx * 140; p.vy += dy * 60 - 60;
    if (p.climbing) { p.climbing = false; p.regrab = 0.35; }
    this.ev('hit', p.x);
    if (p.hp <= 0) {
      p.dead = true; p.climbing = false; p.respT = 1.6;
      if (owner !== p.id) this.scores[owner]++;
      this.burst(p.x, p.y, 0, -1, p.color, 26);
      this.ev('die', p.x);
    }
  }

  burst(x, y, nx, ny, col, n) {
    this.makeSparks(x, y, nx, ny, col, n);
    this.ev('burst', 0, [x, y, nx, ny, col, n]);   // lets the remote peer spawn the same sparks
  }
  makeSparks(x, y, nx, ny, col, n) {
    const base = Math.atan2(ny, nx);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() * 2.6 - 1.3), sp = 60 + Math.random() * 200;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.2 + Math.random() * 0.3, col });
    }
  }
}

function moveToward(v, target, d) { return v < target ? Math.min(v + d, target) : Math.max(v - d, target); }

// segment (x,y)+(dx,dy) vs box; returns {t, nx, ny} for entry point or null
function segBox(x, y, dx, dy, bx, by, bw, bh) {
  if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return { t: 0, nx: -sgn(dx), ny: 0 };
  let t0 = 0, t1 = 1, nx = 0, ny = 0;
  for (let ax = 0; ax < 2; ax++) {
    const o = ax ? y : x, d = ax ? dy : dx, lo = ax ? by : bx, hi = lo + (ax ? bh : bw);
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let ta = (lo - o) / d, tb = (hi - o) / d, n = -1;
    if (ta > tb) { const s = ta; ta = tb; tb = s; n = 1; }
    if (ta > t0) { t0 = ta; nx = ax ? 0 : n; ny = ax ? n : 0; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return { t: t0, nx, ny };
}
