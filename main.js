'use strict';
const cv = document.getElementById('game'), g = cv.getContext('2d');
const $ = id => document.getElementById(id);

let mode = 'none';            // 'none' | 'local' | 'host' | 'guest'
let paused = false, bg = null, toast = '', toastT = 0, ping = 0, remoteIn = { mx: 0, my: 0, j: false, s: false };
let outEvents = [], firstSnap = true, touchSeen = matchMedia('(pointer:coarse)').matches;

const game = new Game((name, x, extra) => {
  if (mode === 'guest') return;                      // guest only plays what the host tells it
  if (name !== 'burst') Sfx.play(name, x);
  if (mode === 'host') outEvents.push(extra ? [name, r1(x), extra] : [name, r1(x)]);
});

function say(t) { toast = t; toastT = 2.5; }
function startRoom(seed) { game.newRoom(seed); bg = bakeRoom(game.room); outEvents = []; }

// ============================================================ keyboard / gamepad
const keys = {};
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Period', 'Comma'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  Sfx.init();
  if (e.code === 'KeyR') newRoomKey();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Escape') toggleMenu();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function kbInput(set) {
  const k = c => keys[c] ? 1 : 0;
  if (set === 0) return { mx: k('KeyD') - k('KeyA'), my: k('KeyS') - k('KeyW'), j: !!(keys.Space), s: !!keys.KeyF };
  if (set === 1) return { mx: k('ArrowRight') - k('ArrowLeft'), my: k('ArrowDown') - k('ArrowUp'), j: !!keys.Period, s: !!keys.Comma };
  return { mx: k('KeyD') - k('KeyA') + k('ArrowRight') - k('ArrowLeft'), my: k('KeyS') - k('KeyW') + k('ArrowDown') - k('ArrowUp'),
    j: !!(keys.Space || keys.Period), s: !!(keys.KeyF || keys.Comma) };
}
function padInput(i) {
  const pads = (navigator.getGamepads && navigator.getGamepads()) || [], pd = pads[i];
  const r = { mx: 0, my: 0, j: false, s: false };
  if (!pd) return r;
  const ax = pd.axes[0] || 0, ay = pd.axes[1] || 0;
  if (Math.hypot(ax, ay) > 0.25) { r.mx = ax; r.my = ay; }
  const b = n => pd.buttons[n] && pd.buttons[n].pressed;
  if (b(14)) r.mx = -1; if (b(15)) r.mx = 1; if (b(12)) r.my = -1; if (b(13)) r.my = 1;
  r.j = !!b(0); r.s = !!(b(2) || b(7) || b(5));
  return r;
}

// ============================================================ on-screen touch controls
function mkStick(cx, cy, r) { return { cx, cy, r, id: null, x: 0, y: 0, kx: 0, ky: 0 }; }
function mkBtn(cx, cy, r, label) { return { cx, cy, r, label, id: null, down: false }; }
let sets = [];   // each: {owner, stick, jump, shoot}
function layoutControls() {
  if (mode === 'local') sets = [
    { owner: 0, color: COLORS[0], stick: mkStick(120, 590, 82), jump: mkBtn(285, 645, 38, 'JUMP'), shoot: mkBtn(355, 540, 44, 'SHOOT') },
    { owner: 1, color: COLORS[1], stick: mkStick(1160, 590, 82), jump: mkBtn(995, 645, 38, 'JUMP'), shoot: mkBtn(925, 540, 44, 'SHOOT') }];
  else sets = [{ owner: mode === 'guest' ? 1 : 0, color: COLORS[mode === 'guest' ? 1 : 0], stick: mkStick(130, 590, 86),
    jump: mkBtn(1010, 640, 42, 'JUMP'), shoot: mkBtn(1140, 560, 52, 'SHOOT') }];
}
function toVirtual(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
cv.addEventListener('pointerdown', e => {
  Sfx.init();
  if (e.pointerType === 'touch') touchSeen = true;
  if (!touchSeen) return;
  const p = toVirtual(e);
  for (const s of sets) {
    if (s.stick.id === null && Math.hypot(p.x - s.stick.cx, p.y - s.stick.cy) < s.stick.r * 1.5) { s.stick.id = e.pointerId; moveStick(s.stick, p); cv.setPointerCapture(e.pointerId); }
    for (const b of [s.jump, s.shoot]) if (b.id === null && Math.hypot(p.x - b.cx, p.y - b.cy) < b.r * 1.3) { b.id = e.pointerId; b.down = true; cv.setPointerCapture(e.pointerId); }
  }
});
function moveStick(st, p) {
  let dx = (p.x - st.cx) / st.r, dy = (p.y - st.cy) / st.r; const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  st.kx = dx; st.ky = dy; st.x = l > 0.18 ? dx : 0; st.y = l > 0.18 ? dy : 0;
}
cv.addEventListener('pointermove', e => { const p = toVirtual(e); for (const s of sets) if (s.stick.id === e.pointerId) moveStick(s.stick, p); });
function release(e) {
  for (const s of sets) {
    if (s.stick.id === e.pointerId) { s.stick.id = null; s.stick.x = s.stick.y = s.stick.kx = s.stick.ky = 0; }
    for (const b of [s.jump, s.shoot]) if (b.id === e.pointerId) { b.id = null; b.down = false; }
  }
}
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('contextmenu', e => e.preventDefault());

function readInput(idx) {                // merged keyboard + pad + touch input for one player
  const set = mode === 'local' ? idx : 2;
  const a = kbInput(set), b = padInput(mode === 'local' ? idx : 0);
  const t = sets.find(s => s.owner === idx);
  let mx = a.mx + b.mx + (t ? t.stick.x : 0), my = a.my + b.my + (t ? t.stick.y : 0);
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  return { mx, my, j: a.j || b.j || !!(t && t.jump.down), s: a.s || b.s || !!(t && t.shoot.down) };
}

function drawControls() {
  if (!touchSeen) return;
  for (const s of sets) {
    const st = s.stick; g.lineWidth = 2.5;
    g.fillStyle = s.color + '1a'; g.strokeStyle = s.color + '77';
    g.beginPath(); g.arc(st.cx, st.cy, st.r, 0, 7); g.fill(); g.stroke();
    g.fillStyle = s.color + (st.id !== null ? '99' : '55');
    g.beginPath(); g.arc(st.cx + st.kx * st.r, st.cy + st.ky * st.r, st.r * 0.4, 0, 7); g.fill();
    for (const b of [s.jump, s.shoot]) {
      g.fillStyle = s.color + (b.down ? '66' : '22'); g.strokeStyle = s.color + '99';
      g.beginPath(); g.arc(b.cx, b.cy, b.r, 0, 7); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 14px system-ui'; g.textAlign = 'center'; g.fillText(b.label, b.cx, b.cy + 5);
    }
  }
}

// ============================================================ menu / flow
function panel(id) { document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.id === id)); }
function showMenu(id) { $('menu').style.display = 'flex'; $('ctlHelp').style.display = id === 'p-resume' ? 'none' : ''; panel(id); }
function hideMenu() { $('menu').style.display = 'none'; }
function setMsg(el, t, err) { el.textContent = t; el.classList.toggle('err', !!err); }
function steps(prefix, n) { for (let i = 1; i <= 3; i++) $(prefix + i).classList.toggle('done', i <= n); }

function toggleMenu() {
  if ($('menu').style.display === 'none') { paused = mode === 'local'; showMenu(mode === 'none' ? 'p-home' : 'p-resume'); }
  else if (mode !== 'none') { hideMenu(); paused = false; }
}
function toggleMute() { Sfx.setMuted(!Sfx.muted); $('muteBtn').textContent = Sfx.muted ? '🔇' : '🔊'; }
function newRoomKey() {
  if (mode === 'local') { startRoom((Math.random() * 2 ** 31) | 0); Sfx.play('newroom'); }
  else if (mode === 'host') { const sd = (Math.random() * 2 ** 31) | 0; startRoom(sd); Net.send({ t: 'room', seed: sd }); Sfx.play('newroom'); }
  else if (mode === 'guest') say('Only the host can generate a new room');
}
function goHome() { Net.close(); mode = 'none'; sets = []; paused = false; showMenu('p-home'); }

function startLocal() {
  Net.close(); mode = 'local'; layoutControls(); startRoom((Math.random() * 2 ** 31) | 0);
  hideMenu(); paused = false; Sfx.play('spawn', 640);
}

function startHost() {
  Net.close(); mode = 'none'; showMenu('p-host'); steps('h', 0);
  $('hostCode').textContent = '· · · · ·'; setMsg($('hostMsg'), 'Connecting to the matchmaking server…');
  Net.host({
    code(c) {
      $('hostCode').textContent = c; steps('h', 2);
      setMsg($('hostMsg'), 'Room is open. Waiting for your friend to join…');
      $('bCopyCode').onclick = () => copy(c, 'Code copied');
      $('bCopyLink').onclick = () => copy(inviteLink(c), 'Invite link copied');
    },
    open() {                                          // friend connected -> start as host
      mode = 'host'; layoutControls(); remoteIn = { mx: 0, my: 0, j: false, s: false };
      const sd = (Math.random() * 2 ** 31) | 0; startRoom(sd);
      Net.send({ t: 'start', seed: sd });
      Sfx.play('connect'); hideMenu(); say('Friend connected – you are CYAN (left)');
    },
    data: onHostData,
    closed() { if (mode === 'host') { say('Friend left the room'); mode = 'none'; Net.close(); showMenu('p-home'); } },
    error(m) { if (mode === 'host') { say(m); } setMsg($('hostMsg'), m, true); }
  });
}
function onHostData(d) {
  if (d.t === 'in') remoteIn = { mx: d.mx, my: d.my, j: !!d.j, s: !!d.s };
  else if (d.t === 'ping') Net.send({ t: 'pong', ts: d.ts });
}

function startJoin(code) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return setMsg($('joinMsg'), 'The room code has 5 characters.', true);
  steps('j', 2); setMsg($('joinMsg'), 'Connecting…');
  firstSnap = true;
  Net.join(code, {
    open() { steps('j', 3); setMsg($('joinMsg'), 'Connected! Waiting for the host to start…'); },
    data(d) {
      if (d.t === 'start') {
        mode = 'guest'; layoutControls(); startRoom(d.seed); firstSnap = true;
        Sfx.play('connect'); hideMenu(); say('Connected – you are ORANGE (right)');
      } else if (d.t === 'room') { startRoom(d.seed); firstSnap = true; Sfx.play('newroom'); }
      else if (d.t === 's' && mode === 'guest') { applySnap(game, d, firstSnap); firstSnap = false; }
      else if (d.t === 'pong') ping = Math.round(performance.now() - d.ts);
    },
    closed() { if (mode === 'guest') { say('Host left the room'); } mode = 'none'; Net.close(); showMenu('p-home'); },
    error(m) { setMsg($('joinMsg'), m, true); if (mode === 'guest') { mode = 'none'; showMenu('p-home'); } }
  });
}
function inviteLink(c) { return location.origin + location.pathname + '?room=' + c; }
function copy(text, ok) {
  const done = () => setMsg($('hostMsg'), ok);
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => setMsg($('hostMsg'), 'Copy failed – select the code manually.', true));
  else setMsg($('hostMsg'), 'Copy not available – select the code manually.', true);
  Sfx.play('ui');
}

$('bLocal').onclick = () => { Sfx.init(); startLocal(); };
$('bCreate').onclick = () => { Sfx.init(); Sfx.play('ui'); startHost(); };
$('bJoin').onclick = () => { Sfx.init(); Sfx.play('ui'); showMenu('p-join'); steps('j', 1); setMsg($('joinMsg'), ''); $('joinCode').focus(); };
$('bJoinGo').onclick = () => { Sfx.init(); startJoin($('joinCode').value); };
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') { Sfx.init(); startJoin($('joinCode').value); } });
document.querySelectorAll('.back').forEach(b => b.onclick = () => { goHome(); });
$('bResume').onclick = () => { hideMenu(); paused = false; };
$('bLeave').onclick = goHome;
$('menuBtn').onclick = () => { Sfx.init(); toggleMenu(); };
$('muteBtn').onclick = () => { Sfx.init(); toggleMute(); };

// ============================================================ fit canvas to window
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', fit); fit();

// ============================================================ main loop
let last = performance.now(), acc = 0, lastSend = 0, lastInSend = 0, lastPing = 0, prevIn = '';
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  toastT = Math.max(toastT - dt, 0);
  const playing = mode !== 'none' && game.room;

  if (playing && !paused) {
    if (mode === 'local') {
      game.players[0].in = readInput(0); game.players[1].in = readInput(1);
    } else if (mode === 'host') {
      game.players[0].in = readInput(0); game.players[1].in = remoteIn;
    } else if (mode === 'guest') {
      const inp = readInput(1), key = [inp.mx.toFixed(1), inp.my.toFixed(1), +inp.j, +inp.s].join();
      if ((key !== prevIn && now - lastInSend > 16) || now - lastInSend > 33) {
        Net.send({ t: 'in', mx: r2(inp.mx), my: r2(inp.my), j: inp.j, s: inp.s }); prevIn = key; lastInSend = now;
      }
      if (now - lastPing > 2000) { Net.send({ t: 'ping', ts: performance.now() }); lastPing = now; }
    }
    if (mode === 'guest') {
      const k = 1 - Math.exp(-30 * dt);
      game.players.forEach(p => smoothPlayer(p, k));
      for (const b of game.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
      for (const s of game.sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.92; s.vy = s.vy * 0.92 + 500 * dt; }
      game.sparks = game.sparks.filter(s => s.life > 0);
    } else {
      acc += dt;
      while (acc >= 1 / 60) { game.step(1 / 60); acc -= 1 / 60; }
      if (mode === 'host' && now - lastSend >= 33) { Net.send(packSnap(game, outEvents)); outEvents = []; lastSend = now; }
    }
  }
  draw();
  requestAnimationFrame(frame);
}

function draw() {
  g.clearRect(0, 0, W, H);
  if (!game.room || mode === 'none') { g.fillStyle = '#0b0d13'; g.fillRect(0, 0, W, H); return; }
  drawWorld(g, game, bg);
  g.textAlign = 'center'; g.font = '700 30px system-ui';
  g.fillStyle = COLORS[0]; g.fillText(game.scores[0], 600, 82);
  g.fillStyle = COLORS[1]; g.fillText(game.scores[1], 680, 82);
  g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText(':', 640, 80);
  g.font = '12px system-ui'; g.fillStyle = 'rgba(255,255,255,.4)';
  const me = mode === 'host' ? 'ONLINE · you are CYAN' : mode === 'guest' ? 'ONLINE · you are ORANGE · ' + (ping ? ping + ' ms' : '…') : 'LOCAL';
  g.fillText(me, 640, 100);
  if (!touchSeen) g.fillText(mode === 'local' ? 'P1: WASD + Space + F    ·    P2: Arrows + . + ,    ·    hold toward a wall to climb    ·    R new room' :
    'Move: WASD / arrows    ·    Jump: Space or .    ·    Shoot: F or ,    ·    hold toward a wall to climb' + (mode === 'host' ? '    ·    R new room' : ''), 640, 708);
  drawControls();
  if (toastT > 0) { g.globalAlpha = Math.min(toastT, 1); g.font = '700 18px system-ui'; g.fillStyle = '#fff'; g.fillText(toast, 640, 140); g.globalAlpha = 1; }
}
requestAnimationFrame(frame);

// invite link ?room=CODE -> open the join screen prefilled
(() => {
  const r = new URLSearchParams(location.search).get('room');
  if (r) { showMenu('p-join'); steps('j', 2); $('joinCode').value = r.toUpperCase().slice(0, 5); setMsg($('joinMsg'), 'Invite link detected. Press Join room.'); }
})();
