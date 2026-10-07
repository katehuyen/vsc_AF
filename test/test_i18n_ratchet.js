// U-189 — NEW INTERFACE TEXT GOES THROUGH t(), measured.
//
// The interface language is wired a page at a time and the rest is frozen; what
// must not happen meanwhile is new English written straight into a page, which
// would make the unwired part grow under the wiring. So every media/*.js file's
// count of BARE interface text (an English phrase in a string or a template's
// text, not handed to t / tr / lab / label, nor marked N_ — a phrase declared in
// a table and translated where it is drawn) is held to its baseline in
// test/i18n.ratchet.json: it may fall, never rise, and a new file starts at 0.
//
// What counts: a run of two plain words in a literal's text once tags, <style>
// blocks and CSS declarations are stripped — plus the title / placeholder /
// aria-label / alt values inside its tags. A heuristic; only the DELTA matters.
// A directive ('use strict') is never interface text, so a file split in two does not grow the sum.
// A literal that is not interface text (a log line, a font name) carries
// `i18n-exempt` in a comment on its own line.
//
//   node test/test_i18n_ratchet.js          check
//   node test/test_i18n_ratchet.js --fix    lower the baseline to today's counts (never raises one)
//   node test/test_i18n_ratchet.js --seed   start a baseline where none exists
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const MEDIA = path.join(ROOT, 'media');
const BASE = path.join(__dirname, 'i18n.ratchet.json');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const WRAPPERS = new Set(['t', 'tr', 'lab', 'label', 'N_']);
const PHRASE = /(^|[^\w-])[A-Za-z]{2,} [A-Za-z]{2,}(?=[^\w-]|$)/;
const ATTR = /\b(?:title|placeholder|aria-label|alt)="([^"]*)"/g;

/** Is this literal piece interface text? */
function isUiText(text) {
    const attrs = [...text.matchAll(ATTR)].map(m => m[1]);
    const bare = text
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/<[^>]*$/, ' ')
        .replace(/^[^<]*?>/, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/[\w-]+\s*:\s*[^;{}]*;/g, ' ');
    return PHRASE.test(bare) || attrs.some(a => PHRASE.test(a));
}

const calleeName = c => (ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '');

/** A literal handed straight to t( … ) and its kin is wired. */
function wired(node) {
    let n = node;
    if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        n = n.parent;
        if (n && ts.isTemplateSpan(n)) { n = n.parent; }
    }
    const p = n && n.parent;
    return !!p && ts.isCallExpression(p) && p.arguments[0] === n && WRAPPERS.has(calleeName(p.expression));
}

function bareCount(file) {
    const src = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const lines = src.split('\n');
    let n = 0;
    const visit = node => {
        const directive = ts.isStringLiteral(node) && node.text === 'use strict' && ts.isExpressionStatement(node.parent);
        if (!directive && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
            || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) {
            const line = lines[sf.getLineAndCharacterOfPosition(node.getStart(sf)).line] || '';
            if (!/i18n-exempt/.test(line) && !wired(node) && isUiText(node.text)) { n++; }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return n;
}

const pages = fs.readdirSync(MEDIA).filter(f => f.endsWith('.js') && !/^afI18n\./.test(f)).sort();
const now = {};
for (const f of pages) { now[f] = bareCount(path.join(MEDIA, f)); }
const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : {};

if (process.argv.includes('--seed')) {
    if (fs.existsSync(BASE)) { console.log('i18n ratchet: a baseline exists — --seed only starts one; use --fix to lower it'); process.exit(1); }
    fs.writeFileSync(BASE, JSON.stringify(now, null, 2) + '\n', 'utf8');
    console.log(`i18n ratchet: baseline started for ${pages.length} files`);
    process.exit(0);
}
if (process.argv.includes('--fix')) {
    const out = {};
    for (const f of pages) {
        if (f in base) { out[f] = Math.min(base[f], now[f]); } else if (now[f] === 0) { out[f] = 0; }
    }
    fs.writeFileSync(BASE, JSON.stringify(out, null, 2) + '\n', 'utf8');
    const lowered = pages.filter(f => f in base && now[f] < base[f]);
    console.log(`i18n ratchet: ${lowered.length} lowered${lowered.length ? ' (' + lowered.join(', ') + ')' : ''}; a new file with bare text is never admitted here`);
    process.exit(0);
}

// the measure itself
ok('a phrase in a string is interface text', isUiText('Open the note') && isUiText('Select all {n} shown'));
ok('…and in a template\'s text between tags, and in a hover attribute', isUiText('<button class="x">Stop chain</button>') && isUiText('<span title="Open its chain">⑂</span>'));
ok('a class list, a CSS block, a single word and an id are not', !isUiText('<div class="ch-row open">') && !isUiText('<style>.x { border: 1px solid var(--y); }</style>')
    && !isUiText('done') && !isUiText('agentfarm.openChains') && !isUiText('afchain-badge afbaton'));
{
    const tmp = path.join(require('os').tmpdir(), 'af-i18n-ratchet-probe.js');
    fs.writeFileSync(tmp, [
        "'use strict';",
        "const a = t('Open the note');",
        "const b = 'Open the note';",
        "const c = `<b>${t('Stop chain')}</b>`;",
        "const d = `<b>Stop the chain</b>`;",
        "const e = { label: N_('Leg ceiling') };",
        "console.log('loaded the page'); // i18n-exempt"
    ].join('\n'));
    ok('the counter skips a directive, what t() is handed, an N_ declaration and an exempt line, and counts the rest', bareCount(tmp) === 2);
    fs.unlinkSync(tmp);
}

// the ratchet
const grew = pages.filter(f => now[f] > (f in base ? base[f] : 0));
ok('no page carries more bare interface text than its baseline — new text goes through t() (docs/CONVENTIONS.md, U-189)'
    + (grew.length ? ': ' + grew.map(f => `${f} ${f in base ? base[f] : 'new'} → ${now[f]}`).join(' · ') : ''), grew.length === 0);
const gone = Object.keys(base).filter(f => !pages.includes(f));
ok('the baseline names only files that exist (--fix drops the rest)' + (gone.length ? ': ' + gone.join(', ') : ''), gone.length === 0);
const lower = pages.filter(f => f in base && now[f] < base[f]);
if (lower.length) { console.log(`  note: ${lower.length} file(s) now below their baseline — run --fix to lock it in (${lower.join(', ')})`); }

console.log(`test_i18n_ratchet: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
