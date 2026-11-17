'use strict';
// All sound is synthesized with WebAudio: no audio files needed.
const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false, timer = null, step = 0, nextT = 0;
  const lastPlayed = {};

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextT = ctx.currentTime + 0.1;
    timer = setInterval(music, 50);
  }

  function out(pan) {
    if (!ctx.createStereoPanner) return master;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    p.connect(master);
    return p;
  }

  function tone(f0, f1, dur, type, vol, pan, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out(pan));
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq, type, pan, delay) {
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'highpass'; f.frequency.value = freq || 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out(pan));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  const sounds = {
    shoot(p) { tone(1100, 110, 0.13, 'square', 0.16, p); noise(0.09, 0.22, 2500, 'highpass', p); tone(90, 40, 0.12, 'sine', 0.3, p); },
    jump(p) { tone(260, 560, 0.12, 'triangle', 0.18, p); },
    walljump(p) { tone(320, 760, 0.14, 'triangle', 0.2, p); noise(0.05, 0.1, 3000, 'highpass', p); },
    grab(p) { noise(0.06, 0.2, 700, 'bandpass', p); tone(180, 120, 0.06, 'square', 0.08, p); },
    land(p) { noise(0.08, 0.18, 400, 'lowpass', p); tone(110, 55, 0.1, 'sine', 0.22, p); },
    hit(p) { noise(0.12, 0.3, 1800, 'bandpass', p); tone(420, 90, 0.14, 'sawtooth', 0.16, p); },
    wall(p) { noise(0.05, 0.12, 2200, 'highpass', p); tone(1800, 900, 0.04, 'square', 0.05, p); },
    die(p) { noise(0.5, 0.35, 900, 'lowpass', p); tone(380, 40, 0.55, 'sawtooth', 0.22, p); tone(200, 30, 0.7, 'square', 0.1, p, 0.05); },
    spawn(p) { tone(300, 900, 0.18, 'sine', 0.15, p); tone(450, 1350, 0.18, 'sine', 0.09, p, 0.06); },
    connect() { tone(520, 520, 0.09, 'sine', 0.2); tone(780, 780, 0.14, 'sine', 0.2, 0, 0.1); },
    ui() { tone(700, 900, 0.05, 'square', 0.07); },
    newroom() { tone(200, 800, 0.3, 'sawtooth', 0.1); noise(0.3, 0.12, 600, 'bandpass'); }
  };

  // simple dark bass/arp loop, 128 bpm, scheduled slightly ahead
  const BASS = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 65.4, 0];
  const ARP = [220, 262, 330, 262, 196, 247, 294, 247, 233, 294, 349, 294, 220, 262, 330, 392];
  function music() {
    if (!ctx || muted) { if (ctx) nextT = Math.max(nextT, ctx.currentTime); return; }
    const sd = 60 / 128 / 4;
    while (nextT < ctx.currentTime + 0.2) {
      const dt = nextT - ctx.currentTime, i = step % 16;
      if (BASS[i]) tone(BASS[i], BASS[i] * 0.98, sd * 1.8, 'sawtooth', 0.05, -0.1, dt);
      if (i % 4 === 0) tone(120, 40, 0.14, 'sine', 0.16, 0, dt);
      if (i % 2 === 1) noise(0.03, 0.03, 7000, 'highpass', 0.2, dt);
      if (i % 2 === 0) tone(ARP[(step >> 1) % 16] * (step % 64 < 32 ? 1 : 1.5), ARP[(step >> 1) % 16], sd * 1.2, 'triangle', 0.025, 0.25, dt);
      step++; nextT += sd;
    }
  }

  function play(name, x) {
    if (!ctx || muted || !sounds[name]) return;
    const now = ctx.currentTime;                     // stop sound spam
    if (lastPlayed[name] && now - lastPlayed[name] < 0.035) return;
    lastPlayed[name] = now;
    sounds[name](x === undefined ? 0 : (x / 1280 - 0.5) * 1.5);
  }

  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; }
  return { init, play, setMuted, get muted() { return muted; } };
})();
