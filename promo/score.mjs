// The film's soundtrack, synthesized so it is ours to use: a 120 BPM score in
// A minor (Am F C G) plus sound design locked to the picture's cues.
//   node score.mjs            -> score.wav (48 kHz, 16-bit stereo, 30 s)
// Cue times are film seconds and match promo.html (loader 0-3 s, story after).
import { writeFileSync } from "node:fs";

const SR = 48000;
const DUR = 30;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);

// Film-clock cues (story time t maps to film time 3 + t * 0.9).
const film = (story) => 3 + story * 0.9;
const CUTS = [2.7, 7.2, 12.3, 17.3, 22.3, 26.6].map(film); // scene starts after the logo
const LOGO = 3.05;
const DRUMS_IN = CUTS[0];
const HATS_IN = CUTS[1];
const OUTRO = CUTS[5];
const COUNTER = [film(12.6), film(14.4)];
const TYPING = [film(19.2), film(19.2) + 83 / 44];

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const add = (i, l, r = l) => {
  if (i >= 0 && i < N) {
    L[i] += l;
    R[i] += r;
  }
};
const at = (t) => Math.floor(t * SR);
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ score
const BEAT = 0.5; // 120 BPM
const BAR = 4 * BEAT;
const CHORDS = [
  { root: 55.0, notes: [220.0, 261.63, 329.63] }, // Am
  { root: 43.65, notes: [174.61, 220.0, 261.63] }, // F
  { root: 65.41, notes: [261.63, 329.63, 392.0] }, // C
  { root: 49.0, notes: [196.0, 246.94, 293.66] }, // G
];
const chordAt = (t) => CHORDS[Math.floor(Math.max(0, t - 3) / BAR) % 4];

// Pads: soft detuned sines, one chord per bar from the logo on, swelling in.
function pad(start, end, freqs, gain) {
  const a = at(start);
  const b = at(end + 0.8);
  for (let i = a; i < b; i++) {
    const t = (i - a) / SR;
    const len = end - start;
    const env = Math.min(1, t / 0.45) * (t > len ? Math.max(0, 1 - (t - len) / 0.8) : 1);
    let l = 0;
    let r = 0;
    for (const f of freqs) {
      l += Math.sin(TAU * f * 0.997 * t) + 0.25 * Math.sin(TAU * f * 2 * t);
      r += Math.sin(TAU * f * 1.003 * t) + 0.25 * Math.sin(TAU * f * 2.001 * t);
    }
    add(i, l * env * gain, r * env * gain);
  }
}

// A struck note with exponential decay: plucks, bass, bells.
function note(start, freq, { gain = 0.1, decay = 6, harm = 0.2, pan = 0, len = 1.2 } = {}) {
  const a = at(start);
  for (let i = a; i < a + at(len); i++) {
    const t = (i - a) / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-decay * t);
    const v = (Math.sin(TAU * freq * t) + harm * Math.sin(TAU * freq * 3 * t)) * env * gain;
    add(i, v * (1 - pan) * 0.5 * 2, v * (1 + pan) * 0.5 * 2);
  }
}

function kick(start, gain = 0.55) {
  const a = at(start);
  let phase = 0;
  for (let i = a; i < a + at(0.35); i++) {
    const t = (i - a) / SR;
    const f = 45 + 95 * Math.exp(-t * 28);
    phase += (TAU * f) / SR;
    add(i, Math.sin(phase) * Math.exp(-t * 9) * gain);
  }
}

function hat(start, gain = 0.045, decay = 45) {
  const a = at(start);
  let prev = 0;
  for (let i = a; i < a + at(0.12); i++) {
    const t = (i - a) / SR;
    const n = rand();
    const hp = n - prev; // crude high-pass
    prev = n;
    const v = hp * Math.exp(-t * decay) * gain;
    add(i, v * 0.8, v);
  }
}

// Noise through a swept one-pole low-pass: the whoosh on every cut.
function whoosh(center, gain = 0.32, width = 0.42) {
  const a = at(center - width);
  const b = at(center + width);
  let lp = 0;
  for (let i = a; i < b; i++) {
    const x = (i - a) / (b - a); // 0..1
    const env = Math.sin(Math.PI * x) ** 2;
    const cutoff = 300 + 5200 * env;
    const k = 1 - Math.exp((-TAU * cutoff) / SR);
    lp += k * (rand() - lp);
    const v = lp * env * gain;
    add(i, v * (1 - x) * 1.4 + v * 0.3, v * x * 1.4 + v * 0.3); // pans left to right with the light
  }
}

function impact(start) {
  kick(start, 0.8);
  note(start, 55, { gain: 0.35, decay: 2.2, harm: 0.1, len: 2.5 });
  const a = at(start);
  let lp = 0;
  for (let i = a; i < a + at(1.2); i++) {
    const t = (i - a) / SR;
    lp += 0.08 * (rand() - lp);
    add(i, lp * Math.exp(-t * 4) * 0.5);
  }
}

function blip(start, freq, gain = 0.07, len = 0.035) {
  const a = at(start);
  for (let i = a; i < a + at(len); i++) {
    const t = (i - a) / SR;
    add(i, Math.sin(TAU * freq * t) * Math.exp(-t * (4 / len)) * gain);
  }
}

// ------------------------------------------------------------------ loader (0-3 s)
pad(0.2, 3.0, [110, 164.81], 0.05); // low A drone under the dial
for (let k = 0; k <= 10; k++) {
  // one tick per 10% of the dial (it follows a smoothstep over 0.3-2.6 s)
  const p = k / 10;
  // invert smoothstep numerically
  let lo = 0;
  let hi = 1;
  for (let j = 0; j < 30; j++) {
    const m = (lo + hi) / 2;
    if (m * m * (3 - 2 * m) < p) lo = m;
    else hi = m;
  }
  blip(0.3 + lo * 2.3, 1400 + k * 90, 0.06);
}
{
  // riser into the logo
  const a = at(1.2);
  const b = at(3.0);
  let phase = 0;
  let lp = 0;
  for (let i = a; i < b; i++) {
    const x = (i - a) / (b - a);
    const f = 180 + 700 * x * x;
    phase += (TAU * f) / SR;
    lp += (0.02 + 0.3 * x) * (rand() - lp);
    const env = x * x;
    add(i, (Math.sin(phase) * 0.08 + lp * 0.18) * env);
  }
}
impact(LOGO);

// ------------------------------------------------------------------ music (3-30 s)
for (let bar = 0; 3 + bar * BAR < OUTRO; bar++) {
  const start = 3 + bar * BAR;
  const chord = CHORDS[bar % 4];
  pad(start, Math.min(start + BAR, OUTRO), chord.notes, 0.028);
}
for (let t = DRUMS_IN; t < OUTRO - 0.01; t += BEAT) {
  kick(t, 0.42);
  const chord = chordAt(t);
  note(t, chord.root * 2, { gain: 0.16, decay: 5, harm: 0.35, len: 0.5 });
}
for (let t = HATS_IN + BEAT / 2; t < OUTRO - 0.01; t += BEAT) hat(t);
// Arpeggio in 8ths from the headline on, climbing through the chord.
for (let t = DRUMS_IN, step = 0; t < OUTRO - 0.01; t += BEAT / 2, step++) {
  const chord = chordAt(t);
  const pattern = [0, 1, 2, 1, 2, 0, 1, 2];
  const f = chord.notes[pattern[step % 8]] * 2;
  note(t, f, { gain: 0.045, decay: 7, harm: 0.15, pan: step % 2 ? 0.45 : -0.45, len: 0.6 });
}

// ------------------------------------------------------------------ picture cues
for (const cut of CUTS) whoosh(cut - 0.05);
// counter: ticks that speed up and rise, like the number
for (let t = COUNTER[0], k = 0; t < COUNTER[1]; k++) {
  blip(t, 1800 + k * 22, 0.035, 0.02);
  t += 0.03 + 0.06 * ((t - COUNTER[0]) / (COUNTER[1] - COUNTER[0]));
}
// keyboard clicks while the API response types out
for (let t = TYPING[0]; t < TYPING[1]; t += 0.022 + Math.abs(rand()) * 0.012) hat(t, 0.05, 90);
blip(TYPING[1] + 0.05, 1320, 0.06, 0.12); // a soft "done" chime

// ------------------------------------------------------------------ outro
note(OUTRO, 110, { gain: 0.25, decay: 1.2, harm: 0.1, len: 3.5 });
kick(OUTRO, 0.6);
pad(OUTRO, 29.4, [220.0, 261.63, 329.63, 493.88], 0.03); // Am(add9), held
for (const [f, d] of [
  [880, 0],
  [1318.5, 0.12],
  [1760, 0.24],
]) note(OUTRO + 0.4 + d, f, { gain: 0.05, decay: 1.6, harm: 0.05, len: 3 }); // bell

// ------------------------------------------------------------------ master
const fadeIn = at(0.15);
const fadeOut = at(1.6);
let peak = 0;
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut);
  L[i] = Math.tanh(L[i] * 1.2) * g;
  R[i] = Math.tanh(R[i] * 1.2) * g;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(36 + N * 4, 4);
pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  pcm.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4);
}
writeFileSync(new URL("./score.wav", import.meta.url), pcm);
console.log(`score.wav: ${DUR}s, peak normalised from ${peak.toFixed(2)}`);
