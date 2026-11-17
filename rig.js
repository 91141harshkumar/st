'use strict';
// Procedural stick-figure rig: no keyframes. Limbs: 0 L foot, 1 R foot, 2 L hand, 3 R (gun) hand.
const THIGH = 16, SHIN = 16, UPARM = 12, FOREARM = 12, FEET_Y = 32, SHOULDER_Y = -19, NECK_Y = -23, HEAD_Y = -31;
const WALL_REST = [12, 22, -30, -22], WALL_THR = [18, 18, 26, 26], GUN_LEN = 18, MAX_SPEED = 210;
const V = (x, y) => ({ x, y });

function rigReset(p) {
  const gx = p.x, gy = p.y;
  const limb = [V(gx - 5, gy + FEET_Y), V(gx + 5, gy + FEET_Y), V(gx - 6, gy - 8), V(gx + 8, gy - 8)];
  p.rig = { limb, from: limb.map(l => V(l.x, l.y)), to: limb.map(l => V(l.x, l.y)), t: [1, 1, 1, 1],
    step: [false, false, false, false], lean: 0, bob: 2, run: 0, ta: 0,
    sh: V(gx, gy + SHOULDER_Y), mz: V(gx + 20, gy - 10) };
}

function rigStep(p, dt) {
  const R = p.rig;
  R.ta += dt;
  const stride = clamp(Math.abs(p.vx) / MAX_SPEED, 0, 1);
  let tl = clamp(p.vx / MAX_SPEED, -1, 1) * 5;
  if (p.climbing) tl = p.ws * 5;
  R.lean = lerp(R.lean, tl, 1 - Math.exp(-10 * dt));
  R.run += Math.abs(p.vx) * dt * 0.07;
  if (p.climbing) rigClimb(p, dt);
  else if (p.floor) rigGround(p, dt, stride);
  else rigAir(p, dt);
  rigArms(p, dt, stride);
}

function rigGround(p, dt, stride) {
  const R = p.rig, gy = p.y + FEET_Y, moving = Math.abs(p.vx) > 20, dirx = sgn(p.vx);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1, other = 1 - i;
    if (R.step[i]) {
      R.t[i] += dt * (6 + stride * 8);
      const k = Math.min(R.t[i], 1), e = k * k * (3 - 2 * k);
      R.limb[i] = V(lerp(R.from[i].x, R.to[i].x, e), lerp(R.from[i].y, R.to[i].y, e) - Math.sin(k * Math.PI) * (4 + 7 * stride));
      if (R.t[i] >= 1) { R.step[i] = false; R.limb[i] = V(R.to[i].x, R.to[i].y); }
    } else {
      const l = R.limb[i];
      l.y = lerp(l.y, gy, 1 - Math.exp(-30 * dt));
      const rel = l.x - p.x;
      let need, target = side * 5;
      if (moving) { need = rel * dirx < -(6 + 10 * stride); target = dirx * (4 + 12 * stride) + side * 3; }
      else need = Math.abs(rel - side * 5) > 9;
      const emergency = Math.abs(rel) > 22;
      if (need && (emergency || !R.step[other])) {
        R.step[i] = true; R.t[i] = 0; R.from[i] = V(l.x, l.y); R.to[i] = V(p.x + target, gy);
      }
    }
  }
  const spread = Math.abs(R.limb[0].x - R.limb[1].x);
  const wb = Math.min(1.5 + spread * 0.12, 5) + Math.sin(R.ta * 2.2) * 0.4;
  R.bob = lerp(R.bob, wb, 1 - Math.exp(-14 * dt));
}

function rigAir(p, dt) {
  const R = p.rig, k = 1 - Math.exp(-16 * dt), rising = p.vy < 0;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const t = rising ? V(p.x + side * 6 + p.facing * (i === 0 ? 10 : 3), p.y + 17 - side * 2)
                     : V(p.x + side * 9 - p.vx * 0.012, p.y + 28 + clamp(p.vy * 0.003, 0, 4));
    R.limb[i] = V(lerp(R.limb[i].x, t.x, k), lerp(R.limb[i].y, t.y, k));
    R.step[i] = false;
  }
  R.bob = lerp(R.bob, 0, k);
}

function rigClimb(p, dt) {
  const R = p.rig, ws = p.ws, wallX = p.x + ws * 8;
  const vdir = Math.abs(p.vy) > 8 ? sgn(p.vy) : 0, kx = 1 - Math.exp(-18 * dt), gunBusy = p.firing > 0;
  R.bob = lerp(R.bob, 0, kx);
  for (let i = 0; i < 4; i++) {
    if (!R.step[i]) continue;
    R.t[i] += dt * 12;
    const k = Math.min(R.t[i], 1), e = k * k * (3 - 2 * k);
    R.limb[i] = V(lerp(R.from[i].x, R.to[i].x, e) - ws * Math.sin(k * Math.PI) * 5, lerp(R.from[i].y, R.to[i].y, e));
    if (R.t[i] >= 1) { R.step[i] = false; R.limb[i] = V(R.to[i].x, R.to[i].y); }
  }
  for (let pair = 0; pair < 2; pair++) {          // one hand + one foot reach at a time
    const a = pair * 2;
    if (R.step[a] || R.step[a + 1]) continue;
    let best = -1, bd = 0;
    for (const i of [a, a + 1]) {
      if (i === 3 && gunBusy) continue;
      const d = Math.abs(R.limb[i].y - (p.y + WALL_REST[i] + vdir * 8));
      if (d > WALL_THR[i] && d > bd) { best = i; bd = d; }
    }
    if (best >= 0) {
      R.step[best] = true; R.t[best] = 0; R.from[best] = V(R.limb[best].x, R.limb[best].y);
      R.to[best] = V(wallX, p.y + WALL_REST[best] + vdir * 8);
    }
  }
  for (let i = 0; i < 4; i++) {
    if (R.step[i] || (i === 3 && gunBusy)) continue;
    R.limb[i].x = lerp(R.limb[i].x, wallX, kx);
  }
}

function rigArms(p, dt, stride) {
  const R = p.rig;
  R.sh = V(p.x + R.lean, p.y + SHOULDER_Y + R.bob * 0.6 + Math.sin(R.ta * 2.2) * 0.6);
  const rec = p.recoil * 5, swayY = Math.sin(R.run * 2) * 1.3 * stride;
  const ax = p.ax, ay = p.ay, px = -ay * p.facing, py = ax * p.facing;   // "below" the barrel
  const gun = V(R.sh.x + ax * (21 - rec), R.sh.y + ay * (21 - rec) + swayY);
  const off = V(R.sh.x + ax * (13 - rec * 0.5) + px * 3, R.sh.y + ay * (13 - rec * 0.5) + py * 3 + swayY);
  R.mz = V(R.sh.x + ax * (21 - rec + GUN_LEN), R.sh.y + ay * (21 - rec + GUN_LEN));
  const k = 1 - Math.exp(-22 * dt);
  if (!p.climbing) {
    R.limb[3] = V(lerp(R.limb[3].x, gun.x, k), lerp(R.limb[3].y, gun.y, k));
    R.limb[2] = V(lerp(R.limb[2].x, off.x, k), lerp(R.limb[2].y, off.y, k));
    R.step[2] = R.step[3] = false;
  } else if (p.firing > 0) {
    R.limb[3] = V(lerp(R.limb[3].x, gun.x, k), lerp(R.limb[3].y, gun.y, k));
    R.step[3] = false;
  }
}
