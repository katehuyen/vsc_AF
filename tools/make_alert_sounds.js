// Generates the nineteen alert tones beside media/sounds/turn-ready.wav
// (A-18: nine, plus turn-ready.wav itself · A-20: the ten modern `af_*`
// voices that are now the defaults).
//
// ‼️ THE ASSETS ARE GENERATED, NOT SOURCED. The same reason `make_turn_sound.js`
// gives, now for ten voices instead of one: the obvious way to get ten alert
// sounds is to download them, and then the extension ships ten files whose
// licence nobody can state. These are written from arithmetic. There is nothing
// in them to licence, they cost 40 kB together, and the character of each one
// is a line of code somebody can read and argue with.
//
// ‼️ `chime-soft` IS `turn-ready.wav` AND IS NOT REGENERATED. It is the sound
// every current install already makes; rewriting it — even into something
// nicer — would change the alert of every user who never asked for it. The id
// is new, the bytes are the ones already committed (A-18 design note §3).
//
//   node tools/make_alert_sounds.js         — rewrite the nineteen assets
//   node tools/make_alert_sounds.js --check — are the committed files what this
//                                             script produces? (byte-identical)
//   node tools/make_alert_sounds.js --stats — length, brightness and body of
//                                             every voice, and the pairs that
//                                             MUST be tellable apart
const fs = require('fs');
const path = require('path');

const RATE = 44100;
const DIR = path.resolve(__dirname, '..', 'media', 'sounds');
/** The ceiling every voice is normalised to — loud enough across a room,
 *  with the headroom that stops a laptop speaker rattling. */
const PEAK = 0.7079;                  // -3 dBFS
const MAX_MS = 1200;                  // the design note's ceiling, checked below

/**
 * One partial-rich note. `decay` is how fast it dies (higher = shorter tail),
 * `odd` adds an octave, `buzz` adds a dissonant neighbour — the three knobs
 * that separate a chime from a bell from a buzzer.
 */
function note(freq, ms, gain, opts) {
    const o = opts || {};
    const n = Math.round(RATE * ms / 1000);
    const out = new Float64Array(n);
    const attack = Math.round(RATE * (o.attackMs === undefined ? 5 : o.attackMs) / 1000) || 1;
    const decay = o.decay === undefined ? 3.2 : o.decay;
    const octave = o.octave === undefined ? 0.28 : o.octave;
    const buzz = o.buzz || 0;
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const env = (i < attack ? i / attack : 1) * Math.exp(-decay * (i / n));
        out[i] = env * gain * (
            Math.sin(2 * Math.PI * freq * t)
            + octave * Math.sin(4 * Math.PI * freq * t)
            + buzz * Math.sin(2 * Math.PI * freq * 1.0595 * t)
        );
    }
    return out;
}

/**
 * ‼️ A-20 — A STRUCK BODY, AND `ratios` IS THE ONLY KNOB THAT MATTERS.
 *
 * The partials of a real object are not a harmonic series, and that — not the
 * envelope — is what makes wood sound like wood: a marimba bar rings at
 * 1 : 3.9 : 9.2, a tubular bell at 1 : 2.76 : 5.40, and no amount of envelope
 * shaping turns one into the other. `note()` above has ONE fixed shape, which
 * is why the first family are ten versions of the same chime. These are ten
 * different objects.
 *
 * Higher partials die faster (`spread`) and start quieter (`tilt`), which is
 * what a strike sounds like; without it a stack of sines sounds like an organ.
 */
function struck(freq, ms, gain, ratios, opts) {
    const o = opts || {};
    const n = Math.round(RATE * ms / 1000);
    const out = new Float64Array(n);
    const attack = Math.max(1, Math.round(RATE * (o.attackMs === undefined ? 3 : o.attackMs) / 1000));
    const decay = o.decay === undefined ? 3.2 : o.decay;
    const spread = o.spread === undefined ? 1.5 : o.spread;
    const tilt = o.tilt === undefined ? 1.4 : o.tilt;
    const detune = o.detune || 0;
    for (let k = 0; k < ratios.length; k++) {
        const f = freq * ratios[k] * (1 + detune * k);
        const g = gain / Math.pow(k + 1, tilt);
        const d = decay * Math.pow(spread, k);
        for (let i = 0; i < n; i++) {
            const env = (i < attack ? i / attack : 1) * Math.exp(-d * (i / n));
            out[i] += env * g * Math.sin(2 * Math.PI * f * i / RATE);
        }
    }
    return out;
}

/**
 * A note that MOVES — `f0` to `f1` over its length. The phase is integrated
 * rather than recomputed per sample, because `sin(2πf(t)·t)` with a changing
 * `f` is not a sweep, it is a discontinuity: it clicks.
 */
function glide(f0, f1, ms, gain, opts) {
    const o = opts || {};
    const n = Math.round(RATE * ms / 1000);
    const out = new Float64Array(n);
    const attack = Math.max(1, Math.round(RATE * (o.attackMs === undefined ? 3 : o.attackMs) / 1000));
    const decay = o.decay === undefined ? 3.2 : o.decay;
    const octave = o.octave === undefined ? 0 : o.octave;
    const curve = o.curve === undefined ? 1 : o.curve;
    let phase = 0;
    for (let i = 0; i < n; i++) {
        const f = f0 + (f1 - f0) * Math.pow(i / n, curve);
        phase += 2 * Math.PI * f / RATE;
        const env = (i < attack ? i / attack : 1) * Math.exp(-decay * (i / n));
        out[i] = env * gain * (Math.sin(phase) + octave * Math.sin(2 * phase));
    }
    return out;
}

/**
 * A transient with no pitch of its own — the wooden half of a knock.
 *
 * ‼️ THE RANDOMNESS IS SEEDED. `--check` compares committed bytes against what
 * this script produces, and a knock that came out different every run could
 * never be committed at all. `tone` is a one-pole low pass: low values make a
 * thud, high ones a hiss.
 */
function knock(ms, gain, opts) {
    const o = opts || {};
    const n = Math.round(RATE * ms / 1000);
    const out = new Float64Array(n);
    const decay = o.decay === undefined ? 22 : o.decay;
    const tone = o.tone === undefined ? 0.12 : o.tone;
    let seed = o.seed === undefined ? 1 : o.seed;
    let y = 0;
    for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        y += tone * ((seed / 0x3fffffff) - 1 - y);
        out[i] = y * gain * Math.exp(-decay * (i / n));
    }
    return out;
}

/** Notes laid on a timeline: `[startMs, samples]`, mixed, then normalised. */
function mix(parts) {
    let total = 0;
    for (const [atMs, buf] of parts) {
        total = Math.max(total, Math.round(RATE * atMs / 1000) + buf.length);
    }
    const out = new Float64Array(total);
    for (const [atMs, buf] of parts) {
        const at = Math.round(RATE * atMs / 1000);
        for (let i = 0; i < buf.length; i++) { out[at + i] += buf[i]; }
    }
    // ‼️ NORMALISE, DO NOT TRUST THE GAINS. A voice built from three partials
    // clips where one built from two does not, and a clipped alert is the
    // crackle a user reports as "the extension is broken".
    let peak = 0;
    for (let i = 0; i < out.length; i++) { peak = Math.max(peak, Math.abs(out[i])); }
    const k = peak > 0 ? PEAK / peak : 1;
    for (let i = 0; i < out.length; i++) { out[i] *= k; }
    return out;
}

function wav(samples) {
    const pcm = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        const v = Math.max(-1, Math.min(1, samples[i]));
        pcm.writeInt16LE(Math.round(v * 32767), i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);        // PCM chunk size
    header.writeUInt16LE(1, 20);         // format: PCM
    header.writeUInt16LE(1, 22);         // channels: mono
    header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * 2, 28);  // byte rate
    header.writeUInt16LE(2, 32);         // block align
    header.writeUInt16LE(16, 34);        // bits per sample
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

/**
 * ‼️ THE FEELING IS IN THE NAME AND THE SHAPE, NOT IN THE FILE NAME.
 *
 * These are not ten variations of a beep. A person across the room has to tell
 * "your turn" from "it is asking you something" WITHOUT looking, so the two
 * that matter most are built to be opposite gestures: a question RISES and
 * knocks twice, an ending FALLS. The rest ride the same mechanism for free.
 */
const VOICES = {
    // Bright, one clear strike a fifth up — the same gesture as chime-soft,
    // higher and shorter, for somebody who finds the default too round.
    'chime-bright': () => mix([
        [0, note(1174.66, 110, 0.5, { decay: 3.6, octave: 0.34 })],
        [90, note(1760, 220, 0.45, { decay: 3.8, octave: 0.3 })]
    ]),
    // ‼️ A QUESTION KNOCKS TWICE. Two equal notes, close together: the shape
    // of a knuckle on a door, and nothing else in the set is a pair of equals.
    'ask-double': () => mix([
        [0, note(987.77, 90, 0.5, { decay: 5, octave: 0.2 })],
        [130, note(987.77, 130, 0.5, { decay: 4.4, octave: 0.2 })]
    ]),
    // …and a question RISES. The intonation of asking, in two notes.
    'ask-rise': () => mix([
        [0, note(659.25, 110, 0.48, { decay: 4, octave: 0.24 })],
        [110, note(987.77, 240, 0.5, { decay: 3.4, octave: 0.26 })]
    ]),
    // Stalled: low, slow, unhurried — it is not urgent, it is stuck.
    'low-pulse': () => mix([
        [0, note(220, 260, 0.55, { decay: 2.4, octave: 0.4, attackMs: 18 })],
        [300, note(220, 320, 0.5, { decay: 2.2, octave: 0.4, attackMs: 18 })]
    ]),
    // The quietest thing in the set: one dry tick, for an event somebody wants
    // acknowledged and not announced.
    'tick-dry': () => mix([
        [0, note(1568, 45, 0.45, { decay: 9, octave: 0.1, attackMs: 1 })]
    ]),
    // A bell heard from another room: soft attack, long tail, inside 1.2 s.
    'bell-far': () => mix([
        [0, note(523.25, 1100, 0.5, { decay: 4.2, octave: 0.5, attackMs: 30 })],
        [0, note(1046.5, 900, 0.16, { decay: 5, octave: 0.2, attackMs: 30 })]
    ]),
    // ‼️ AN ENDING FALLS — the opposite gesture to `ask-rise`, on purpose.
    'close-fall': () => mix([
        [0, note(880, 130, 0.48, { decay: 3.6, octave: 0.26 })],
        [120, note(587.33, 300, 0.5, { decay: 3, octave: 0.3 })]
    ]),
    // Dissonant on purpose: a minor second beating against itself is heard as
    // wrong by everybody, which is what an error should be.
    'error-buzz': () => mix([
        [0, note(311.13, 320, 0.5, { decay: 3, octave: 0.2, buzz: 0.6, attackMs: 2 })]
    ]),
    // Three fast strikes. The only voice in the set that repeats quickly, so it
    // is the only one that sounds like it wants somebody to move.
    'alarm-urgent': () => mix([
        [0, note(1318.51, 90, 0.5, { decay: 6, octave: 0.3, attackMs: 1 })],
        [140, note(1318.51, 90, 0.5, { decay: 6, octave: 0.3, attackMs: 1 })],
        [280, note(1567.98, 200, 0.55, { decay: 4.5, octave: 0.34, attackMs: 1 })]
    ]),

    // ======================================================= A-20, the modern
    // ‼️ TEN OBJECTS, NOT TEN ENVELOPES. The nine above are one mechanism —
    // `note()`, a sine with an octave and a decay — heard nine ways, and from
    // the next room they are recognisably relatives. A person who has to tell
    // "your turn" from "it is asking you" while doing something else needs
    // sounds that differ in TEXTURE, not in melody: glass, wood, a knuckle on
    // a panel, a sweep. That is what `struck`, `glide` and `knock` are for.
    //
    // These are the defaults from 3.308.0. Every voice above stays selectable,
    // and `turn-ready.wav` is still on disk under the id `chime-soft`, so
    // nobody who CHOSE a sound loses it.

    // ‼️ YOUR TURN. Tubular-bell ratios (1 : 2.76 : 5.40) an octave up: glass
    // rather than metal, and — the whole point — a SETTLED gesture with a
    // fifth that arrives late and quiet. It does not rise, so it cannot be
    // mistaken for the question.
    'af_crystal_turn': () => mix([
        [0, struck(1046.5, 880, 0.5, [1, 2.76, 5.40, 8.93], { decay: 3.2, spread: 1.35, attackMs: 2 })],
        [80, struck(1567.98, 600, 0.2, [1, 2.76], { decay: 4.0, spread: 1.4, attackMs: 3 })]
    ]),

    // ‼️ IT IS ASKING YOU. A knuckle on a panel, twice. The only voice with
    // almost no pitch: it is told apart from every chime in the set by TEXTURE,
    // which is what survives a closed door and a running tap. Two equal knocks,
    // because a pair of equals is the shape of somebody at the door.
    'af_intercom_knock': () => mix([
        [0, knock(120, 0.85, { seed: 7, decay: 24, tone: 0.22 })],
        [0, struck(174.61, 190, 0.30, [1, 2.4, 4.1], { decay: 8, spread: 1.5, attackMs: 1 })],
        [165, knock(120, 0.85, { seed: 29, decay: 24, tone: 0.22 })],
        [165, struck(174.61, 220, 0.30, [1, 2.4, 4.1], { decay: 7, spread: 1.5, attackMs: 1 })]
    ]),

    // A singing bowl: two nearly-equal partials beating slowly against each
    // other, a 60 ms attack so it swells rather than strikes. The calm one.
    'af_zen_chime': () => mix([
        [0, struck(440, 1180, 0.5, [1, 2.01, 2.98], { decay: 2.4, spread: 1.2, tilt: 1.1, detune: 0.004, attackMs: 60 })],
        [0, struck(659.25, 1000, 0.16, [1, 2.02], { decay: 2.8, spread: 1.2, attackMs: 80 })]
    ]),

    // ‼️ STUCK, AND SINKING. A ping that FALLS while it rings — the only
    // downward-moving pitch in the set — over a low body that outlasts it.
    // Nothing else here sounds like it is going away from you.
    'af_deep_sonar': () => mix([
        [0, glide(740, 610, 620, 0.45, { decay: 4.2, attackMs: 2, curve: 0.6 })],
        [0, struck(110, 1150, 0.55, [1, 2, 3], { decay: 2.0, spread: 1.3, tilt: 1.8, attackMs: 25 })]
    ]),

    // Going to sleep: three notes down a gentle third at a time, each softer
    // and slower than the last. A falling line is the one shape everybody
    // reads as "finished, and not coming back for a while".
    'af_lullaby_sleep': () => mix([
        [0, struck(783.99, 340, 0.44, [1, 2, 3], { decay: 3.4, spread: 1.4, tilt: 1.7, attackMs: 22 })],
        [300, struck(659.25, 360, 0.40, [1, 2, 3], { decay: 3.2, spread: 1.4, tilt: 1.7, attackMs: 26 })],
        [600, struck(523.25, 580, 0.36, [1, 2, 3], { decay: 2.6, spread: 1.4, tilt: 1.7, attackMs: 30 })]
    ]),

    // Wood. A marimba bar's ratios (1 : 3.9 : 9.2) with a 1 ms attack and a
    // short tail, two notes up a fifth: warm, dry and unmistakably positive
    // without being a fanfare.
    'af_marimba_success': () => mix([
        [0, struck(523.25, 260, 0.5, [1, 3.9, 9.2], { decay: 6.5, spread: 1.7, tilt: 1.9, attackMs: 1 })],
        [130, struck(783.99, 420, 0.5, [1, 3.9, 9.2], { decay: 5.5, spread: 1.7, tilt: 1.9, attackMs: 1 })]
    ]),

    // The smallest thing that can mean "it moved": one blip up, 110 ms end to
    // end. For an event somebody wants to feel rather than be told.
    'af_pop_advance': () => mix([
        [0, glide(620, 1240, 110, 0.5, { decay: 7, attackMs: 1, curve: 0.5, octave: 0.12 })]
    ]),

    // Two thin ticks high up, no octave, no body — the quietest-SOUNDING voice
    // in the set. It cannot be quieter (every voice is normalised to the same
    // peak, or it would not carry across a room); it is thin and short
    // instead, which is how a sound gets out of the way.
    'af_subtle_alert': () => mix([
        [0, struck(2093, 45, 0.5, [1], { decay: 11, attackMs: 1 })],
        [110, struck(2637, 55, 0.45, [1], { decay: 10, attackMs: 1 })]
    ]),

    // ‼️ URGENT, AND STILL A BELL. Three strikes that ACCELERATE and rise —
    // the tempo carries the urgency, so it does not have to be a buzzer that
    // people learn to hate and then switch off.
    'af_bell_urgent': () => mix([
        [0, struck(1046.5, 260, 0.5, [1, 2.76, 5.40], { decay: 6, spread: 1.4, attackMs: 1 })],
        [190, struck(1046.5, 240, 0.5, [1, 2.76, 5.40], { decay: 6, spread: 1.4, attackMs: 1 })],
        [330, struck(1318.51, 620, 0.55, [1, 2.76, 5.40], { decay: 4, spread: 1.4, attackMs: 1 })]
    ]),

    // Something has started: a short sweep up into a firm note that holds.
    // The mirror image of `af_lullaby_sleep`, on purpose.
    'af_pulse_start': () => mix([
        [0, glide(330, 659.25, 120, 0.42, { decay: 2.2, attackMs: 4, curve: 0.8 })],
        [110, struck(659.25, 480, 0.5, [1, 2, 3.02], { decay: 4.2, spread: 1.4, tilt: 1.6, attackMs: 2 })]
    ])
};

/**
 * ‼️ WHETHER TEN SOUNDS ARE DIFFERENT IS A MEASUREMENT, NOT A HOPE.
 *
 * Nobody can listen to these in a code review, and "it sounds modern" is not
 * something a test can hold. Two numbers can be: the **brightness** (spectral
 * centroid — where the energy sits, which is what separates wood from glass)
 * and the **body** (RMS over peak, which is what separates a tick from a bell
 * that rings). A pair that matches on both is two names for one sound, and the
 * whole point of a palette is that a person can tell its members apart.
 */
function measure(samples) {
    let peak = 0, sum = 0;
    for (let i = 0; i < samples.length; i++) {
        peak = Math.max(peak, Math.abs(samples[i]));
        sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    // Brightness without an FFT: the rate of zero crossings is proportional to
    // where the spectral mass sits, and for a decaying tone it is stable enough
    // to compare voices with.
    let cross = 0;
    for (let i = 1; i < samples.length; i++) {
        if ((samples[i - 1] < 0) !== (samples[i] < 0)) { cross++; }
    }
    return {
        peak,
        body: peak > 0 ? rms / peak : 0,
        bright: cross / 2 / (samples.length / RATE)
    };
}

const built = Object.entries(VOICES).map(([id, make]) => {
    const samples = make();
    const ms = samples.length / RATE * 1000;
    if (ms > MAX_MS) {
        console.error(`${id}: ${ms | 0} ms is over the ${MAX_MS} ms ceiling`);
        process.exit(2);
    }
    return { id, file: path.join(DIR, id + '.wav'), bytes: wav(samples), ms, ...measure(samples) };
});

if (process.argv.includes('--stats')) {
    console.log('id                    ms   bright Hz   body   peak');
    for (const b of built.slice().sort((x, y) => x.bright - y.bright)) {
        console.log(
            b.id.padEnd(20) + String(b.ms | 0).padStart(5)
            + String(b.bright | 0).padStart(10) + '   '
            + b.body.toFixed(3).padStart(6) + ' ' + b.peak.toFixed(3).padStart(6)
        );
    }
    // ‼️ THE PAIRS THAT CARRY THE WHOLE FEATURE, checked rather than assumed.
    // The user's condition for this item was hearing "your turn" apart from
    // "it is asking you" from another room WITHOUT configuring anything — so
    // it is the DEFAULTS for those two events that have to be far apart, and
    // this is where that is looked at.
    const at = id => built.find(b => b.id === id);
    for (const [a, c] of [
        ['af_crystal_turn', 'af_intercom_knock'],   // turn over vs asking you
        ['af_bell_urgent', 'af_deep_sonar'],        // error vs stuck
        ['af_marimba_success', 'af_crystal_turn']   // ended vs turn over
    ]) {
        const x = at(a), y = at(c);
        if (!x || !y) { continue; }
        const ratio = Math.max(x.bright, y.bright) / Math.max(1, Math.min(x.bright, y.bright));
        console.log(`\n${a} vs ${c}: brightness ×${ratio.toFixed(2)},`
            + ` body ${x.body.toFixed(3)} vs ${y.body.toFixed(3)}`);
    }
    // ‼️ AND ONE PAIR THAT MEASURES THE SAME ON PURPOSE. `af_pulse_start` and
    // `af_lullaby_sleep` sit in one register because they are meant to be each
    // other's mirror: one rises, the other falls. No static measure sees
    // direction, which is the limit of this whole table — it can prove two
    // sounds ARE different, never that two are the same.
    const up = at('af_pulse_start'), down = at('af_lullaby_sleep');
    console.log(`\naf_pulse_start vs af_lullaby_sleep: brightness`
        + ` ×${(Math.max(up.bright, down.bright) / Math.min(up.bright, down.bright)).toFixed(2)}`
        + ` — the same register deliberately; what differs is direction.`);
    process.exit(0);
}

if (process.argv.includes('--check')) {
    let bad = 0;
    for (const b of built) {
        const have = fs.existsSync(b.file) ? fs.readFileSync(b.file) : Buffer.alloc(0);
        if (!have.equals(b.bytes)) { bad++; console.log(`MISMATCH ${b.id}`); }
    }
    console.log(bad
        ? `${bad} of ${built.length} differ — regenerate with: node tools/make_alert_sounds.js`
        : `ok — all ${built.length} generated voices match the generator`);
    process.exit(bad ? 1 : 0);
}

fs.mkdirSync(DIR, { recursive: true });
for (const b of built) {
    fs.writeFileSync(b.file, b.bytes);
    console.log(`wrote ${path.relative(process.cwd(), b.file)} — ${b.bytes.length} bytes, ${b.ms | 0} ms`);
}
console.log(`\n${built.length} voices written. chime-soft is turn-ready.wav and is left alone.`);
