// X-448 — THE REMOTE MODULE'S BORDER, derived from the source.
//
// src/remote reaches Agent Farm only through the RemotePort it is handed:
// every import inside it is a relative path that stays inside src/remote, or a
// node builtin — never 'vscode', never a package, never ../core. And the rest
// of the extension enters it only from src/extension.ts, only through its
// index. A breach is red here, not a code-review remark.
'use strict';
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const REMOTE = path.join(SRC, 'remote');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { out.push(...walk(p)); } else if (/\.ts$/.test(e.name)) { out.push(p); }
    }
    return out;
}

/** Every module specifier a TS file names: import/export from, import(), require(). */
function specifiers(text) {
    const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const found = [];
    const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm;
    let m;
    while ((m = re.exec(noComments))) { found.push(m[2]); }
    return found;
}

const isBuiltin = s => builtinModules.includes(s.replace(/^node:/, ''));
const inside = (abs, dir) => abs === dir || abs.startsWith(dir + path.sep);

// ---------- THE SCANNER SEES WHAT IT MUST (so a green run means something) ----------
const probe = specifiers([
    "import * as vscode from 'vscode';",
    'import { a } from "../core/bridge";',
    "import type { P } from './port';",
    "export { x } from './features';",
    "import './side-effect';",
    "const f = require('fs');",
    "const l = await import('./lazy');",
    "// import nope from 'commented-out';"
].join('\n'));
ok('scanner: finds vscode', probe.includes('vscode'));
ok('scanner: finds a double-quoted path', probe.includes('../core/bridge'));
ok('scanner: finds import type', probe.includes('./port'));
ok('scanner: finds export-from', probe.includes('./features'));
ok('scanner: finds a side-effect import', probe.includes('./side-effect'));
ok('scanner: finds require()', probe.includes('fs'));
ok('scanner: finds dynamic import()', probe.includes('./lazy'));
ok('scanner: ignores a commented import', !probe.includes('commented-out'));

// ---------- INSIDE: src/remote imports only itself and node builtins ----------
const remoteFiles = walk(REMOTE);
ok('src/remote has an index.ts', remoteFiles.includes(path.join(REMOTE, 'index.ts')));
ok('src/remote has a port.ts', remoteFiles.includes(path.join(REMOTE, 'port.ts')));
for (const file of remoteFiles) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const s of specifiers(fs.readFileSync(file, 'utf8'))) {
        if (s.startsWith('.')) {
            ok(`${rel}: '${s}' stays inside src/remote`, inside(path.resolve(path.dirname(file), s), REMOTE));
        } else {
            ok(`${rel}: '${s}' is a node builtin (no vscode, no packages)`, isBuiltin(s));
        }
    }
}

// ---------- OUTSIDE: only src/extension.ts enters, and only by the index ----------
const entry = path.join(SRC, 'extension.ts');
for (const file of walk(SRC).filter(f => !inside(f, REMOTE))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const s of specifiers(fs.readFileSync(file, 'utf8'))) {
        if (!s.startsWith('.')) { continue; }
        const abs = path.resolve(path.dirname(file), s);
        if (!inside(abs, REMOTE)) { continue; }
        ok(`${rel}: only src/extension.ts may import src/remote ('${s}')`, file === entry);
        ok(`${rel}: enters src/remote by its index ('${s}')`, abs === REMOTE || abs === path.join(REMOTE, 'index'));
    }
}

// ---------- THE SURFACE BEHAVES ----------
const R = require(path.join(ROOT, 'out', 'remote', 'index.js'));
const K = require(path.join(ROOT, 'out', 'remote', 'contract', 'index.js'));
ok('every contract feature is a feature id', K.FEATURES.every(f => R.isFeature(f)));
ok('allOpen opens every declared feature', K.FEATURES.every(f => R.allOpen(f).allowed === true));
const unknown = R.allOpen('remote.nope');
ok('an unknown feature fails closed, with a reason', unknown.allowed === false && /remote\.nope/.test(unknown.reason));
const map = R.featureMap(f => f === 'remote.voice' ? { allowed: false, reason: 'no licence' } : { allowed: true });
ok('featureMap answers every declared feature', JSON.stringify(Object.keys(map)) === JSON.stringify(K.FEATURES));
ok('featureMap carries a refusal and its reason', map['remote.voice'].allowed === false && map['remote.voice'].reason === 'no licence');
const welcome = K.checkFrame({ kind: 'welcome', farm: { id: 'f', name: 'n' }, device: 'd', scope: 'read', features: map, lastSeq: 0 });
ok('featureMap fits the welcome frame', welcome.ok);

const lines = [];
const port = {
    farm: () => ({ id: 'farm_t', name: 'Test' }),
    callOp: async () => ({ ok: true, result: null }),
    subscribe: () => () => undefined,
    can: R.allOpen,
    storageDir: () => path.join(require('os').tmpdir(), 'af-remote-boundary'),
    log: l => lines.push(l)
};
const h = R.activateRemote(port);
ok('activateRemote names the contract it speaks', h.contract === `${K.CONTRACT_NAME}/${K.CONTRACT_VERSION}`);
ok('activateRemote logs through the port', lines.length === 1 && lines[0].includes('farm_t'));
ok('the handle disposes', typeof h.dispose === 'function' && (h.dispose(), true));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
