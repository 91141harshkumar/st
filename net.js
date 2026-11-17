'use strict';
// Peer-to-peer layer (PeerJS = WebRTC data channel + free public signaling).
// The HOST runs the whole simulation. The GUEST only sends its input and draws snapshots.
const Net = (() => {
  let peer = null, conn = null, timer = null;
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const mkCode = () => Array.from({ length: 5 }, () => ALPHA[Math.random() * ALPHA.length | 0]).join('');
  const PREFIX = 'stickduel-';

  function close() {
    clearTimeout(timer);
    try { conn && conn.close(); } catch (e) {}
    try { peer && peer.destroy(); } catch (e) {}
    conn = peer = null;
  }
  function send(m) { if (conn && conn.open) { try { conn.send(m); } catch (e) {} } }
  const isOpen = () => !!(conn && conn.open);

  function errText(e) {
    switch (e && e.type) {
      case 'peer-unavailable': return 'Room not found. Check the code, and make sure your friend has created the room.';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
        return 'Could not reach the matchmaking server. Check your internet connection.';
      case 'webrtc': return 'Direct connection failed (a strict network/firewall may block peer-to-peer).';
      default: return 'Connection problem' + (e && e.type ? ' (' + e.type + ')' : '') + '.';
    }
  }
  function wire(c, h) {
    c.on('open', () => { clearTimeout(timer); h.open(); });
    c.on('data', d => h.data(d));
    c.on('close', () => h.closed());
    c.on('error', e => h.error(errText(e)));
  }

  function host(h) {
    close();
    if (typeof Peer === 'undefined') return h.error('Online play needs the PeerJS script, which could not load. Check your internet connection.');
    let attempts = 0;
    const start = () => {
      const code = mkCode(), pr = new Peer(PREFIX + code);
      peer = pr;
      pr.on('open', () => h.code(code));
      pr.on('error', e => {
        if (e.type === 'unavailable-id' && attempts++ < 5) { try { pr.destroy(); } catch (x) {} start(); }
        else h.error(errText(e));
      });
      pr.on('disconnected', () => { try { pr.reconnect(); } catch (e) {} });
      pr.on('connection', c => {
        if (conn && conn.open) { c.on('open', () => c.close()); return; }   // room is full
        conn = c; wire(c, h);
      });
    };
    start();
  }

  function join(code, h) {
    close();
    if (typeof Peer === 'undefined') return h.error('Online play needs the PeerJS script, which could not load. Check your internet connection.');
    const pr = new Peer();
    peer = pr;
    pr.on('error', e => { clearTimeout(timer); h.error(errText(e)); });
    pr.on('open', () => {
      conn = pr.connect(PREFIX + code, { serialization: 'json' });
      wire(conn, h);
      timer = setTimeout(() => { if (!isOpen()) h.error('Timed out. The room may not exist, or your network blocks direct connections.'); }, 15000);
    });
  }
  return { host, join, send, close, isOpen };
})();

// ------------------------------------------------------------ snapshot codec
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

function packSnap(g, evs) {
  return {
    t: 's',
    p: g.players.map(p => {
      const R = p.rig;
      return [r1(p.x), r1(p.y), p.facing, +p.climbing, p.ws, r2(p.ax), r2(p.ay), p.hp, +p.dead, r2(p.flash),
        r2(p.recoil), r2(p.firing), +p.floor, r2(p.alpha), r1(R.bob), r1(R.lean), r1(R.sh.x), r1(R.sh.y),
        r1(R.mz.x), r1(R.mz.y), ...R.limb.flatMap(l => [r1(l.x), r1(l.y)])];
    }),
    b: g.bullets.map(b => [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), b.owner]),
    sc: g.scores, ev: evs
  };
}

function applySnap(g, s, first) {
  s.p.forEach((a, i) => {
    const p = g.players[i];
    if (!p.rig) rigReset(p);
    p.facing = a[2]; p.climbing = !!a[3]; p.ws = a[4]; p.ax = a[5]; p.ay = a[6]; p.hp = a[7]; p.dead = !!a[8];
    p.flash = a[9]; p.recoil = a[10]; p.firing = a[11]; p.floor = !!a[12]; p.alpha = a[13];
    p.tg = { x: a[0], y: a[1], bob: a[14], lean: a[15], sh: V(a[16], a[17]), mz: V(a[18], a[19]),
      limb: [V(a[20], a[21]), V(a[22], a[23]), V(a[24], a[25]), V(a[26], a[27])] };
    if (first) smoothPlayer(p, 1);
  });
  g.bullets = s.b.map(b => ({ x: b[0], y: b[1], vx: b[2], vy: b[3], owner: b[4], life: 1 }));
  g.scores = s.sc;
  for (const e of s.ev) {
    if (e[0] === 'burst') {
      const x = e[2];
      g.makeSparks(x[0], x[1], x[2], x[3], x[4], x[5]);
    } else Sfx.play(e[0], e[1]);
  }
}

function smoothPlayer(p, k) {
  const t = p.tg, R = p.rig; if (!t) return;
  p.x = lerp(p.x, t.x, k); p.y = lerp(p.y, t.y, k);
  R.bob = lerp(R.bob, t.bob, k); R.lean = lerp(R.lean, t.lean, k);
  R.sh = V(lerp(R.sh.x, t.sh.x, k), lerp(R.sh.y, t.sh.y, k));
  R.mz = V(lerp(R.mz.x, t.mz.x, k), lerp(R.mz.y, t.mz.y, k));
  for (let i = 0; i < 4; i++) R.limb[i] = V(lerp(R.limb[i].x, t.limb[i].x, k), lerp(R.limb[i].y, t.limb[i].y, k));
}
