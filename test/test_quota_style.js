// U-154 — the three quota figures' styles (compiled core/quotaStyle.js, pure).
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const Q = require(path.join(__dirname, '..', 'out', 'core', 'quotaStyle.js'));
const rule = (cls, body) => `:root .${cls} { ${body} }`;

ok('three figures, each with its own class and setting',
    Q.QUOTA_FIGURES.map(f => f.cls).join() === 'afq-pct,afq-left,afq-reset'
    && Q.QUOTA_FIGURES.map(f => f.setting).join() === 'quotaStyle.percent,quotaStyle.left,quotaStyle.reset');
ok('…and three different default looks, so the eye can tell them apart',
    new Set(Q.QUOTA_FIGURES.map(f => f.fallback)).size === 3);

const none = Q.quotaStyleCss(() => undefined);
ok('an empty setting draws its default', Q.QUOTA_FIGURES.every(f => none.includes(rule(f.cls, f.fallback))));

const own = Q.quotaStyleCss(s => (s === 'quotaStyle.left' ? 'color: red;   font-family: Consolas;' : ''));
ok('the user\'s own declarations replace the default for that figure only',
    own.includes(rule('afq-left', 'color: red; font-family: Consolas;'))
    && own.includes(rule('afq-pct', Q.QUOTA_FIGURES[0].fallback)));

const evil = Q.quotaStyleCss(s => (s === 'quotaStyle.reset' ? 'color: red } body { display:none </style><script>@import' : ''));
const evilBody = evil.split('\n')[2].replace(/^:root \.afq-reset \{ /, '').replace(/ \}$/, '');
ok('‼️ nothing typed there can close the rule, open another or leave the style element', !/[{}<>@]/.test(evilBody));
ok('…and what is left still styles the one figure', /^:root \.afq-reset \{ color: red/.test(evil.split('\n')[2]));
ok('whitespace only is empty, and falls back', Q.safeDeclarations('   \n ') === ''
    && Q.quotaStyleCss(() => '  ').includes(Q.QUOTA_FIGURES[1].fallback));

// ‼️ The user's look must beat a surface's own base rule (one class) and lose to
// its alarm (two classes): the weight is two classes, never one.
ok('‼️ the percent\'s default is neither of the alarm tones (yellow at 75%, red at 90%), so a warning stays visible',
    !/yellow|red|orange/.test(Q.QUOTA_FIGURES[0].fallback));
ok('‼️ each rule weighs two classes', Q.QUOTA_FIGURES.every(f => Q.quotaSelector(f) === `:root .${f.cls}`));

// ---- every page carries it, and a change reaches the pages already open ----
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const base = read('src', 'panels', 'base.ts');
ok('every page shell carries the style element, after the shared stylesheet',
    /<link rel="stylesheet" href="\$\{css\}">\s*<style id="afq-style">\$\{quotaStyleCss\(/.test(base));
ok('a change is pushed to every open page', /export function pushQuotaStyle\(\)[\s\S]{0,200}quotaCss: quotaStyleCss\(/.test(base)
    && /affectsConfiguration\('agentFarm\.quotaStyle'\)\) \{ pushQuotaStyle\(\); \}/.test(read('src', 'extension.ts')));
ok('…and the page header swaps the style element in place',
    /m\.afui\.quotaCss[\s\S]{0,160}getElementById\('afq-style'\)[\s\S]{0,80}textContent = m\.afui\.quotaCss/.test(read('media', 'pageHeader.js')));

// ---- the settings: contributed, filed, and grouped on Farm Settings ----
const pkg = JSON.parse(read('package.json')).contributes.configuration;
const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
ok('each figure\'s setting is contributed as a string that defaults to empty',
    Q.QUOTA_FIGURES.every(f => props['agentFarm.' + f.setting] && props['agentFarm.' + f.setting].type === 'string'
        && props['agentFarm.' + f.setting].default === ''));
const settingsJs = require('./lib_settings_source').settingsPageSource();
ok('Farm Settings draws the three together under one heading, with a sample line in the real classes',
    Q.QUOTA_FIGURES.every(f => require('../out/core/settingsCatalog/index.js').catalogEntry(f.setting).group === 'quotaFigures')
    && Q.QUOTA_FIGURES.every(f => settingsJs.includes(`<span class="${f.cls}">`)));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
