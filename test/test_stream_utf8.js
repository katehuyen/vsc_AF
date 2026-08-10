// U-36 — a chunk boundary is not a character boundary.
//
// The complaint: talking to Antigravity in Turkish produced `hazır<?><?>m.` —
// a two-byte `ı` cut in half by whatever the pipe happened to flush, each half
// decoding to U+FFFD. The engine sent correct UTF-8; the READER cut it.
//
// This test does not need a child process: the fault is entirely in how a
// Buffer becomes a string, so it is reproduced against the same two code paths
// the host can take — `String(chunk)` (what it did) and a StringDecoder held
// across chunks (what it does).
const path = require('path');
const { StringDecoder } = require('string_decoder');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// A real Turkish reply, and the byte offsets that land inside a character.
const TEXT = '{"type":"text","text":"hazırım, arayüzünün şeması güncellendi."}\n';
const BYTES = Buffer.from(TEXT, 'utf8');
const REPLACEMENT = '�';

/** Every split point of this payload, one at a time. */
function splits() {
    const out = [];
    for (let i = 1; i < BYTES.length; i++) { out.push([BYTES.subarray(0, i), BYTES.subarray(i)]); }
    return out;
}

// ---------- the fault, reproduced ----------
{
    let broke = 0;
    for (const [a, b] of splits()) {
        if ((String(a) + String(b)).includes(REPLACEMENT)) { broke++; }
    }
    ok('‼️ the old path really does corrupt text, and not rarely', broke > 0);
    // Every multi-byte character has (width - 1) interior cut points; this
    // payload has 8 of them (ı ı ü ü ü ş ş ç… counted from the string itself).
    const multi = [...TEXT].filter(c => Buffer.byteLength(c, 'utf8') > 1).length;
    ok('…once per interior byte of every multi-byte character', broke === multi);
}

// ---------- the fix ----------
{
    let broke = 0, short = 0;
    for (const [a, b] of splits()) {
        const d = new StringDecoder('utf8');
        const joined = d.write(a) + d.write(b) + d.end();
        if (joined.includes(REPLACEMENT)) { broke++; }
        if (joined !== TEXT) { short++; }
    }
    ok('‼️ a held decoder never produces a replacement character', broke === 0);
    ok('‼️ …and never loses a byte either, at any split point', short === 0);
}

// ---------- three-way splits, because a pipe does not flush politely ----------
{
    let broke = 0;
    for (let i = 1; i < BYTES.length - 1; i += 3) {
        for (let j = i + 1; j < BYTES.length; j += 5) {
            const d = new StringDecoder('utf8');
            const joined = d.write(BYTES.subarray(0, i)) + d.write(BYTES.subarray(i, j))
                + d.write(BYTES.subarray(j)) + d.end();
            if (joined !== TEXT) { broke++; }
        }
    }
    ok('a character split across THREE chunks still survives', broke === 0);
}

// ---------- and the host actually uses it ----------
{
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('‼️ the host decodes stdout with a held decoder, not String(chunk)',
        /new StringDecoder\('utf8'\)/.test(src)
        && !/this\.onData\(id, String\(d\)\)/.test(src));
    ok('…one per child, so two sessions cannot splice at a boundary',
        /private readStdout\(id: string, child: cp\.ChildProcess\): void \{[\s\S]{0,200}const decoder = new StringDecoder/.test(src));
    ok('…and both spawn sites go through it',
        (src.match(/this\.readStdout\(id, child\);/g) || []).length === 2);
    ok('a dangling tail is flushed rather than swallowed', /decoder\.end\(\);/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
