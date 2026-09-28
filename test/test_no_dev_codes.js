// A backlog code (S-106, X-427 …) is the developers' shorthand and never reaches a user: a setting's
// description, a command title, a tooltip or a page label says what the thing does, not which item
// built it. Measured 2026-09-28: 43 setting descriptions and a dozen page tooltips carried one, and
// the user read "Handover discipline (S-106)" on their own Settings page. Comments are free to cite.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CODE = /\b[A-Z]{1,2}-\d{1,3}(?:\.\d+)?\b/;

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); if (extra) { console.log(extra); } } };

/* ---------- package.json: every string a user reads ---------- */
const USER_KEYS = /^(description|markdownDescription|title|shortTitle|label|category|enumDescriptions|markdownEnumDescriptions|deprecationMessage|markdownDeprecationMessage|placeholder|name|displayName)$/;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const hits = [];
const walk = (o, key, trail) => {
    if (typeof o === 'string') { if (USER_KEYS.test(key) && CODE.test(o)) { hits.push(`${trail}: …${o.match(CODE)[0]}…`); } return; }
    if (Array.isArray(o)) { o.forEach((v, i) => walk(v, key, `${trail}[${i}]`)); return; }
    if (o && typeof o === 'object') { for (const k of Object.keys(o)) { walk(o[k], k, `${trail}.${k}`); } }
};
walk(pkg.contributes, 'contributes', 'contributes');
walk({ displayName: pkg.displayName, description: pkg.description }, '', 'package');
ok('‼️ no setting, command, menu or view in package.json shows a backlog code', !hits.length, hits.map(h => '    ' + h).join('\n'));

/* ---------- the pages: string literals, comments stripped ---------- */
// The one place a code is the SUBJECT, not a label: the Backlog page explains the user's own codes.
const ALLOW = [/"P-4 — complete the project system phases"/, /a P-coded line/, /<code>K-8<\/code>/];
const stripComments = src => src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a);
const literals = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const pageHits = [];
for (const f of fs.readdirSync(path.join(ROOT, 'media')).filter(n => n.endsWith('.js'))) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, 'media', f), 'utf8'));
    for (const m of src.matchAll(literals)) {
        const s = m[0];
        if (!CODE.test(s) || ALLOW.some(a => a.test(s))) { continue; }
        const line = src.slice(0, m.index).split('\n').length;
        pageHits.push(`media/${f}:${line}: …${s.slice(Math.max(0, s.search(CODE) - 40), s.search(CODE) + 20).replace(/\s+/g, ' ')}…`);
    }
}
ok('‼️ no page string (label, tooltip, why-text) shows a backlog code', !pageHits.length, pageHits.map(h => '    ' + h).join('\n'));

console.log(`test_no_dev_codes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
