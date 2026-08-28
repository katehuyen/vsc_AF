// Generates the nine alert tones beside media/sounds/turn-ready.wav (A-18).
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
//   node tools/make_alert_sounds.js         — rewrite the nine assets
//   node tools/make_alert_sounds.js --check — are the committed files what this
//                                             script produces? (byte-identical)
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
    ])
};

const built = Object.entries(VOICES).map(([id, make]) => {
    const samples = make();
    const ms = samples.length / RATE * 1000;
    if (ms > MAX_MS) {
        console.error(`${id}: ${ms | 0} ms is over the ${MAX_MS} ms ceiling`);
        process.exit(2);
    }
    return { id, file: path.join(DIR, id + '.wav'), bytes: wav(samples), ms };
});

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
