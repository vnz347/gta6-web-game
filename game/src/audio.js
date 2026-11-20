// Solmar: sound with no audio files. Everything is synthesised in WebAudio:
// the engine hum, police sirens, gunshots, UI chimes, and three generative
// radio stations (a step sequencer with a bass line, pads and hats per
// station). The context starts on the first user gesture; every call is
// guarded so a missing context never breaks the game.

import { STATIONS } from './config.js';

// Minor-pentatonic step patterns, in semitones above the station root.
const BASS_LINES = [
  [0, 0, 7, 0, 10, 0, 7, 5],
  [0, 0, 0, 12, 0, 0, 10, 7],
  [0, 7, 0, 10, 0, 7, 5, 3],
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenT = 0;
  let sirenHigh = false;
  let station = 0;
  let radioOn = true;
  let radioGain = null;
  let nextStepTime = 0;
  let step = 0;
  let radioTimer = null;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

      // Engine: two detuned saws through a lowpass, pitched by speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      // Siren: one triangle that alternates two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();

      radioGain = ctx.createGain();
      radioGain.gain.value = 0.34;
      radioGain.connect(master);
      nextStepTime = ctx.currentTime + 0.1;
      radioTimer = setInterval(scheduleRadio, 90);
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx) return;
    const t = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(dur, vol, filterFreq, when) {
    if (!ctx) return;
    const t = when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function noteFreq(root, semitones) {
    return root * Math.pow(2, semitones / 12);
  }

  function scheduleRadio() {
    if (!ctx || !radioOn) return;
    const st = STATIONS[station];
    const stepDur = 60 / st.bpm / 2; // eighth notes
    while (nextStepTime < ctx.currentTime + 0.25) {
      const t = nextStepTime;
      const line = BASS_LINES[station];
      const degree = line[step % 8];
      // Bass on every step, hats on the off-beats, a pad every two bars.
      tone(noteFreq(st.root / 2, degree), stepDur * 0.9, station === 1 ? 'sawtooth' : 'triangle', 0.5, t);
      if (step % 2 === 1) noise(0.05, 0.16, 7000, t);
      if (step % 16 === 0) {
        for (const d of [0, 3, 7]) {
          tone(noteFreq(st.root, d), stepDur * 14, 'triangle', 0.08, t);
        }
      }
      if (station === 2 && step % 4 === 2) noise(0.09, 0.2, 1200, t);
      nextStepTime += stepDur;
      step += 1;
    }
  }

  function setStation(index) {
    station = ((index % STATIONS.length) + STATIONS.length) % STATIONS.length;
    step = 0;
  }

  function update(dt, info) {
    if (!ctx) return;
    // Engine follows the car's speed; silent on foot.
    const target = info.inCar ? Math.min(0.22, 0.05 + Math.abs(info.speed) * 0.004) : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    const rpm = 42 + Math.abs(info.speed) * 2.4;
    engineOsc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.06);
    engineOsc2.frequency.setTargetAtTime(rpm * 0.5 + 3, ctx.currentTime, 0.06);
    engineFilter.frequency.setTargetAtTime(300 + Math.abs(info.speed) * 14, ctx.currentTime, 0.1);
    // Siren swells as the nearest unit closes in.
    const sirenTarget = info.policeNear ? Math.max(0, 0.16 - info.policeNear * 0.0016) : 0;
    sirenGain.gain.setTargetAtTime(sirenTarget, ctx.currentTime, 0.15);
    sirenT += dt;
    if (sirenT > 0.42) {
      sirenT = 0;
      sirenHigh = !sirenHigh;
      sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 720, ctx.currentTime, 0.03);
    }
  }

  return {
    init,
    update,
    setStation,
    nextStation() { setStation(station + 1); return STATIONS[station]; },
    get station() { return STATIONS[station]; },
    toggleRadio() { radioOn = !radioOn; return radioOn; },
    shot(kind) {
      if (kind === 'shotgun') { noise(0.22, 0.7, 900); tone(90, 0.18, 'sine', 0.6); }
      else if (kind === 'smg' || kind === 'rifle') { noise(0.09, 0.45, 1600); tone(140, 0.07, 'square', 0.25); }
      else { noise(0.12, 0.5, 1200); tone(120, 0.09, 'square', 0.3); }
    },
    crash(v) { tone(60, 0.25, 'sine', 0.7 * v, undefined, 35); noise(0.2, 0.4 * v, 500); },
    door() { tone(180, 0.07, 'square', 0.2); tone(120, 0.09, 'square', 0.18, ctx ? ctx.currentTime + 0.06 : undefined); },
    pickup() { tone(660, 0.12, 'sine', 0.3); tone(990, 0.18, 'sine', 0.3, ctx ? ctx.currentTime + 0.1 : undefined); },
    ability() { tone(520, 0.1, 'triangle', 0.3); tone(660, 0.1, 'triangle', 0.3, ctx ? ctx.currentTime + 0.09 : undefined); tone(880, 0.16, 'triangle', 0.3, ctx ? ctx.currentTime + 0.18 : undefined); },
    reload() { tone(300, 0.05, 'square', 0.15); tone(220, 0.06, 'square', 0.15, ctx ? ctx.currentTime + 0.12 : undefined); },
    select() { tone(880, 0.06, 'sine', 0.2); },
    swing() { noise(0.14, 0.25, 900); },
    stageDone() { tone(740, 0.1, 'sine', 0.25); tone(1108, 0.14, 'sine', 0.25, ctx ? ctx.currentTime + 0.09 : undefined); },
    missionStart() { tone(440, 0.14, 'triangle', 0.3); tone(554, 0.14, 'triangle', 0.3, ctx ? ctx.currentTime + 0.13 : undefined); tone(659, 0.2, 'triangle', 0.3, ctx ? ctx.currentTime + 0.26 : undefined); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.3, ctx ? ctx.currentTime + i * 0.13 : undefined)); },
    missionFail() { [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.28, ctx ? ctx.currentTime + i * 0.16 : undefined)); },
    siren() { tone(950, 0.3, 'triangle', 0.25); tone(720, 0.3, 'triangle', 0.25, ctx ? ctx.currentTime + 0.3 : undefined); },
  };
}
