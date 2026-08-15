// Generates media/sounds/turn-ready.wav — the YOUR TURN alert (U-66).
//
// ‼️ THE ASSET IS GENERATED, NOT SOURCED. `Console.Beep` was replaced because
// it is a motherboard tone with no failure reporting; the obvious replacement
// is "download a notification sound", and then the extension ships a file whose
// licence nobody can state. This writes the file from arithmetic instead: two
// sine partials, a 5 ms attack and an exponential decay, 44.1 kHz 16-bit mono.
// There is nothing in it to licence.
//
//   node tools/make_turn_sound.js        — rewrite the asset
//   node tools/make_turn_sound.js --check — is the committed file what this
//                                           script produces? (byte-identical)
const fs = require('fs');
const path = require('path');

const RATE = 44100;
const OUT = path.resolve(__dirname, '..', 'media', 'sounds', 'turn-ready.wav');

/** One note: fundamental + a quiet octave, attack/decay envelope, no clicks. */
function note(freq, ms, gain) {
    const n = Math.round(RATE * ms / 1000);
    const out = new Float64Array(n);
    const attack = Math.round(RATE * 0.005);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const env = (i < attack ? i / attack : 1) * Math.exp(-3.2 * (i / n));
        out[i] = env * gain * (
            Math.sin(2 * Math.PI * freq * t) +
            0.28 * Math.sin(4 * Math.PI * freq * t)
        );
    }
    return out;
}

function build() {
    // A rising two-note chime: short, distinct from every system sound, and
    // still recognisable through a laptop speaker across a room.
    const a = note(880, 140, 0.55);
    const b = note(1318.51, 260, 0.5);   // E6 — a fifth above, not a beep pair
    const gap = Math.round(RATE * 0.02);
    const total = a.length + gap + b.length;
    const pcm = Buffer.alloc(total * 2);
    const put = (src, at) => {
        for (let i = 0; i < src.length; i++) {
            const v = Math.max(-1, Math.min(1, src[i]));
            pcm.writeInt16LE(Math.round(v * 32767), (at + i) * 2);
        }
    };
    put(a, 0);
    put(b, a.length + gap);

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

const wav = build();
if (process.argv.includes('--check')) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT) : Buffer.alloc(0);
    const same = have.equals(wav);
    console.log(same
        ? `ok — ${path.relative(process.cwd(), OUT)} matches the generator (${wav.length} bytes)`
        : `MISMATCH — regenerate with: node tools/make_turn_sound.js`);
    process.exit(same ? 0 : 1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, wav);
console.log(`wrote ${path.relative(process.cwd(), OUT)} — ${wav.length} bytes, `
    + `${(wav.length - 44) / 2 / RATE * 1000 | 0} ms`);
