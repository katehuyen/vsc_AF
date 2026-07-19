// Guide bilingual-doc + anchor-contract regression test.
//
// The in-app guide is keyed by stable anchor tokens (Turkish slugs) that live in
// code (health.ts insight guideAnchors, panel openGuide calls, quickStart). The
// Turkish doc resolves them via natural slugify; the English (and any future)
// translation must pin the SAME tokens with explicit `{#token}` headings, or the
// deep links land at the top of the page. This test guards that contract and the
// `{#id}` parsing in renderMarkdown.
const fs = require('fs');
const path = require('path');

// Let the compiled guide.js load in plain node by mocking the 'vscode' import.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
    }
    return origLoad.apply(this, arguments);
};

const guide = require(path.join(__dirname, '..', 'out', 'panels', 'guide.js'));

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error(`FAIL ${name}`); } }
function eq(name, got, want) { ok(`${name} (got ${JSON.stringify(got)} want ${JSON.stringify(want)})`, got === want); }

// --- slugify: Turkish letters fold to ascii ---
eq('slugify tr', guide.slugify('Yetenek Matrisi'), 'yetenek-matrisi');
eq('slugify health', guide.slugify('Sağlık: Hafıza İndeksi'), 'saglik-hafiza-indeksi');

// --- renderMarkdown: explicit {#token} overrides slugify and is stripped from text ---
const md = [
    '## Capability Matrix {#yetenek-matrisi}',
    'body',
    '### Health: Memory Index {#saglik-hafiza-indeksi}',
    '## Live Observation',
].join('\n');
const { html, toc } = guide.renderMarkdown(md);
eq('explicit token id', toc[0].id, 'yetenek-matrisi');
eq('explicit token id 2', toc[1].id, 'saglik-hafiza-indeksi');
eq('natural slug id', toc[2].id, 'live-observation');
eq('token stripped from text', toc[0].text, 'Capability Matrix');
ok('html carries token anchor', html.includes('id="yetenek-matrisi"'));
ok('no literal {# leaks to html', !html.includes('{#'));

// --- anchor contract: every token the code deep-links must resolve in the English doc ---
// Tokens passed to agentfarm.openGuide from health.ts guideAnchors, panels, quickStart.
const CALLER_TOKENS = [
    'hizli-baslangic', 'yetenek-matrisi', 'hafiza-grafigi', 'kanban-panosu', 'onay-kuyrugu',
    'saglik-baglam-yuku', 'saglik-hafiza-indeksi', 'saglik-kopya-hafiza', 'saglik-bayat-hafiza',
    'saglik-buyuk-dosya', 'saglik-kimlik', 'saglik-hata-orani', 'hafiza-yonetimi',
    'nobet-gorevleri', 'antigravity-uyumlulugu', 'guardrail-denetcisi', 'tetik-karnesi',
    'gorev-sagligi', 'nabiz-kontrolu', 'mcp-yonetimi', 'skill-yonetimi', 'sir-kasasi', 'toolbox',
    'turlar-sayfasi',
    'trend-uyarilari', 'maliyet-anomalisi', 'kalite-karnesi', 'talimat-onerileri', 'butce-uyarilari',
];

function resolvableIds(docFile) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'docs', docFile), 'utf8');
    return new Set(guide.renderMarkdown(src).toc.map(t => t.id));
}

// The translation is the doc that must PIN these tokens with explicit `{#token}`
// (the Turkish original resolves them via natural slugify and is left untouched;
// its one historical quirk — the Memory Graph heading — is not our concern here).
const enIds = resolvableIds('BLUEPRINT.en.md');
for (const tok of CALLER_TOKENS) {
    ok(`BLUEPRINT.en.md resolves #${tok}`, enIds.has(tok));
}

console.log(`\ntest_guide_anchors: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
