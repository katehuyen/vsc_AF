/**
 * ‼️ X-252 — THE ENGINES PAGE IS REALLY HANDED WHAT THE CARD DRAWS.
 *
 * Every other test about this card reads the FIXTURE, and a fixture is not a
 * wire. Measured 2026-09-14: four fields were built by `publicAccount`, typed on
 * `EnginesPanelDeps`, drawn by `media/engines.js` and supplied by
 * `test/fixtures/enginespanel.js` — and none of them reached the running page,
 * because the dep in `extension.ts` forwarded a HAND-WRITTEN LIST of fields and
 * the list had stopped at X-269. `standingAgents` and `pinnedAgents` (X-255) and
 * `onIt` and `line` (X-258) were invisible on the real machine while both items
 * shipped green, were photographed, and were closed.
 *
 * That is the same failure `docs/CONVENTIONS.md` already names about a run's
 * dimensions, so it is held the same way — by the SHAPE:
 *
 *   1. the dep hands `publicAccount`'s row over whole, and
 *   2. every field the panel's type declares is one `publicAccount` builds.
 *
 * The second half catches the opposite gap: a field a page draws and a fixture
 * supplies that nothing on the machine ever produces.
 *
 *   node test/test_engines_account_wire.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'enginesPanel.ts'), 'utf8');

/** The text between the brace that opens at `from` and its match. */
function block(src, from) {
    const open = src.indexOf('{', from);
    if (open < 0) { return ''; }
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '{') { depth++; }
        else if (c === '}') { depth--; if (!depth) { return src.slice(open, i + 1); } }
    }
    return '';
}

// ---------------------------------------------------------------- 1. the wire
{
    const at = ext.indexOf('const enginesPanelDeps');
    ok('the engines page deps are in extension.ts', at > 0);
    const deps = block(ext, at);
    const accAt = deps.indexOf('\n        accounts: ()');
    ok('…and they carry an accounts provider', accAt > 0);
    const body = deps.slice(accAt, deps.indexOf('\n        accountEngines', accAt));
    ok('‼️ THE PAGE IS HANDED publicAccount\'s ROW, NOT A COPY OF SOME OF IT',
        /return\s+storedAccounts\(\)\.map\([^)]*=>\s*publicAccount\(/.test(body));
    ok('‼️ …AND NOTHING IN BETWEEN REBUILDS IT FIELD BY FIELD'
        + ' — a literal here is the defect this test exists for',
        !/\bpub\.\w+/.test(body));
}

// ------------------------------------------------- 2. typed, and really built
{
    const at = panel.indexOf('accounts?():');
    ok('the panel declares the account row it expects', at > 0);
    // ‼️ THE TYPE PUTS SEVERAL FIELDS ON ONE LINE (`id: string; engine: string;
    // …`), so a line-start match would check the first of each line and quietly
    // ignore the rest — a guard that reads four fields out of twenty is the
    // kind of half-measurement this whole file is about.
    const declared = block(panel, at).split('\n')
        .filter(l => /^\s{8}\w+\??:/.test(l))
        .flatMap(l => l.split(';'))
        .map(seg => (/^\s*(\w+)\??:/.exec(seg) || [])[1])
        .filter(Boolean);
    ok(`…with fields to check (${declared.length})`, declared.length > 20);

    const made = block(ext, ext.indexOf('const publicAccount ='));
    // `name:` or the shorthand `{ seats, others }` — both are the field being
    // built, and rejecting the second would fail an honest record.
    const missing = declared.filter(f =>
        !new RegExp(`(^|[\\s{,(])${f}\\s*[:,}]`, 'm').test(made));
    ok('‼️ EVERY FIELD THE CARD IS TYPED FOR IS ONE publicAccount ACTUALLY BUILDS'
        + (missing.length ? ' — missing: ' + missing.join(', ') : ''),
        missing.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
