'use strict';
// Canvas drawing for the room, stick figures, bullets and sparks.
function bakeRoom(room) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#13161f'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.03)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.025)'; room.decor.forEach(d => g.fillRect(d.x, d.y, d.w, d.h));
  g.fillStyle = 'rgba(255,255,255,.12)'; room.dust.forEach(d => { g.beginPath(); g.arc(d.x, d.y, 1.2, 0, 7); g.fill(); });
  for (const r of room.rects) {
    g.fillStyle = r.k === 0 ? '#242938' : r.k === 1 ? '#333d52' : '#2e384d';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = r.k === 0 ? '#4d5770' : '#566685'; g.lineWidth = 2; g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    if (r.k === 1) { g.strokeStyle = 'rgba(140,215,255,.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(r.x, r.y + 1); g.lineTo(r.x + r.w, r.y + 1); g.stroke(); }
    if (r.k === 2) {
      g.strokeStyle = 'rgba(255,255,255,.09)'; g.lineWidth = 2;
      for (let y = r.y + 10; y < r.y + r.h - 4; y += 18) { g.beginPath(); g.moveTo(r.x + 5, y); g.lineTo(r.x + r.w - 5, y); g.stroke(); }
    }
  }
  return c;
}

function line(g, a, b, col, w) {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
}
function dot(g, p, r, col) { g.fillStyle = col; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill(); }

function ik(root, tgt, l1, l2, bend) {
  const dx = tgt.x - root.x, dy = tgt.y - root.y, full = Math.hypot(dx, dy);
  const ux = full < 0.001 ? 0 : dx / full, uy = full < 0.001 ? 1 : dy / full;
  const dist = clamp(full, 0.5, l1 + l2 - 0.05);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  return [V(root.x + ux * a + uy * h * bend, root.y + uy * a - ux * h * bend), V(root.x + ux * dist, root.y + uy * dist)];
}
function limb(g, root, tgt, l1, l2, bend, col, w) {
  const [j, e] = ik(root, tgt, l1, l2, bend);
  line(g, root, j, col, w); line(g, j, e, col, w); dot(g, j, w * 0.55, col);
  return e;
}
function gun(g, pos, ang, flip, col) {
  g.save(); g.translate(pos.x, pos.y); g.rotate(ang); g.scale(1, flip);
  g.fillStyle = '#212430'; g.fillRect(-3, -2.5, 15, 5);
  g.fillStyle = '#666b7a'; g.fillRect(11, -1.5, 7, 3);
  g.fillStyle = '#191b21'; g.fillRect(-2, 2, 4.5, 6.5);
  g.fillStyle = col; g.fillRect(1, -2.5, 8, 1.3);
  g.restore();
}

function drawPlayer(g, p) {
  const R = p.rig; if (!R) return;
  g.save(); g.globalAlpha = p.alpha; g.translate(p.x, p.y);
  const L = q => V(q.x - p.x, q.y - p.y);
  const col = p.flash > 0 ? '#fff' : p.color, dark = shade(p.color, 0.5);
  const f = p.facing, clm = p.climbing, ws = p.ws;
  const hip = V(0, R.bob), sh = L(R.sh), neck = V(R.lean * 1.2, NECK_Y + R.bob * 0.5);
  const head = V(R.lean * 1.5 + (clm ? ws * 1.5 : 0), HEAD_Y + R.bob * 0.4);
  const lb = clm ? -ws : f, ab = clm ? ws : -f, fdx = clm ? ws * 3 : f * 4;

  let e = limb(g, hip, L(R.limb[0]), THIGH, SHIN, lb, dark, 2.6); line(g, e, V(e.x + fdx, e.y), dark, 2.6);
  limb(g, sh, L(R.limb[2]), UPARM, FOREARM, ab, dark, 2.6);

  const mid = V(R.lean * 0.4, -10 + R.bob * 0.7);
  g.strokeStyle = col; g.lineWidth = 3.4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(hip.x, hip.y); g.lineTo(mid.x, mid.y); g.lineTo(sh.x, sh.y); g.lineTo(neck.x, neck.y); g.stroke();
  dot(g, head, 6.8, col);
  dot(g, V(head.x + (clm ? ws : f) * 3, head.y - 1), 1.3, '#0d0f16');

  e = limb(g, hip, L(R.limb[1]), THIGH, SHIN, lb, col, 3); line(g, e, V(e.x + fdx, e.y), col, 3);
  limb(g, sh, L(R.limb[3]), UPARM, FOREARM, ab, col, 3);

  if (!clm || p.firing > 0) gun(g, L(R.limb[3]), Math.atan2(p.ay, p.ax), f, col);
  else gun(g, V(hip.x - ws * 5, hip.y + 6), Math.PI / 2, 1, col);
  if (p.recoil > 0.7) { const m = L(R.mz); dot(g, m, 4.5, '#ffd95a'); dot(g, m, 2.4, '#fff'); }
  if (!p.dead) for (let i = 0; i < MAX_HP; i++) dot(g, V(-10 + i * 5, -52), 1.7, i < p.hp ? col : 'rgba(255,255,255,.15)');
  g.restore();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) * k | 0},${(n >> 8 & 255) * k | 0},${(n & 255) * k | 0})`;
}

function drawWorld(g, game, bg) {
  g.drawImage(bg, 0, 0);
  for (const b of game.bullets) {
    const len = Math.hypot(b.vx, b.vy) || 1, bx = b.x - b.vx / len * 16, by = b.y - b.vy / len * 16;
    line(g, V(bx, by), V(b.x, b.y), COLORS[b.owner], 3);
    line(g, V(b.x - b.vx / len * 6, b.y - b.vy / len * 6), V(b.x, b.y), '#fff', 2);
    dot(g, V(b.x, b.y), 2.4, '#fff');
  }
  for (const p of game.players) drawPlayer(g, p);
  for (const s of game.sparks) {
    g.globalAlpha = clamp(s.life * 3, 0, 1); dot(g, s, clamp(s.life * 7, 0.8, 3), s.col);
  }
  g.globalAlpha = 1;
}
