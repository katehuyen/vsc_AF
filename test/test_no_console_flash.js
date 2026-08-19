// X-47 — NOTHING THIS EXTENSION SPAWNS MAY FLASH A CONSOLE WINDOW.
//
// The extension host is a windowless process. Every console program it starts —
// `taskkill`, a CLI, a shell — is given a console of its own by Windows unless
// the spawn asks for `windowsHide`, and that console is a black rectangle that
// appears and disappears on the user's screen. It costs nothing, it is invisible
// in every log, and there is no way to notice it except by watching.
//
// ‼️ SO IT IS MEASURED, NOT REMEMBERED. One spawn added without the flag is one
// flash, and the person who adds it will not be looking at the screen when it
// happens. Every child-process call in `src/` must pass `windowsHide` — or be
// named below, with the reason a window is the POINT of it.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/**
 * ‼️ THE ONLY CALLS ALLOWED TO SHOW A WINDOW, each with the reason.
 * A file is exempted whole because in each of these the window IS the feature.
 */
const OPENS_A_WINDOW_ON_PURPOSE = {
    'core/extTerminal.ts': 'its whole job is opening an external terminal the user asked for',
    'core/reveal.ts': 'explorer.exe is a GUI program and revealing a file IS a window',
    'panels/openDoc.ts': 'it launches the app the USER chose to open a document with; that app showing itself is the whole request'
};

const SRC = path.resolve(__dirname, '..', 'src');
const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); }
        else if (e.name.endsWith('.ts')) { files.push(p); }
    }
})(SRC);
ok('the source tree was found', files.length > 40);

/** Comments and string literals are not code: `parity.ts` NAMES these calls as
 *  strings and makes none, and a call quoted inside a comment is not a spawn. */
function stripNonCode(src) {
    let out = '';
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            i = end < 0 ? src.length : end + 1;
            continue;
        }
        if (c === '/' && src[i + 1] === '/') {
            const end = src.indexOf('\n', i);
            i = end < 0 ? src.length : end - 1;
            out += '\n';
            continue;
        }
        if (c === '"' || c === '\'' || c === '`') {
            const quote = c;
            let j = i + 1;
            while (j < src.length && src[j] !== quote) { j += src[j] === '\\' ? 2 : 1; }
            out += ' '.repeat(Math.min(j, src.length) - i + 1);
            i = j;
            continue;
        }
        out += c;
    }
    return out;
}

/** The call's own argument list, by balanced parentheses — never "the next 400
 *  characters", which reads the flag off the call AFTER the one being checked. */
function callArgs(code, openParen) {
    let depth = 0;
    for (let i = openParen; i < code.length; i++) {
        if (code[i] === '(') { depth++; }
        else if (code[i] === ')') { depth--; if (!depth) { return code.slice(openParen + 1, i); } }
    }
    return code.slice(openParen + 1);
}

const CALL = /\b(?:cp\.)?(spawn|spawnSync|execFile|execFileSync|exec|execSync)\s*\(/g;
const offenders = [];
let checked = 0;
for (const file of files) {
    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    if (OPENS_A_WINDOW_ON_PURPOSE[rel]) { continue; }
    const src = fs.readFileSync(file, 'utf8');
    // Only files that actually import child_process can spawn one; `.exec(` on a
    // regular expression is the commonest word in this repo and is not a spawn.
    if (!/from 'child_process'|require\('child_process'\)/.test(src)) { continue; }
    const code = stripNonCode(src);
    let m;
    CALL.lastIndex = 0;
    while ((m = CALL.exec(code))) {
        // `RE.exec(text)` and `str.replace(…)` — a method on something that is
        // not the child_process module. Only a bare call or a `cp.` one counts.
        const before = code.slice(Math.max(0, m.index - 1), m.index);
        if (before === '.' && !m[0].startsWith('cp.')) { continue; }
        checked++;
        const args = callArgs(code, m.index + m[0].length - 1);
        if (!/windowsHide/.test(args)) {
            offenders.push(`${rel}:${code.slice(0, m.index).split('\n').length} — ${m[1]}`);
        }
    }
}

ok('there are real spawns to check, so a pass is not an empty sweep', checked > 15);
ok('‼️ X-47 — every child process is started with windowsHide'
    + (offenders.length ? ':\n    ' + offenders.join('\n    ') : ''),
    offenders.length === 0);

// …and the exemptions are real files, so the list cannot rot into a free pass.
for (const rel of Object.keys(OPENS_A_WINDOW_ON_PURPOSE)) {
    ok(`the exemption ${rel} names a file that exists`, fs.existsSync(path.join(SRC, rel)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
