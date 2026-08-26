/**
 * The wiki tagger (K-26), live in a browser — the half a page render cannot show.
 *
 * `render_page.js` runs a page script and photographs its markup, and the
 * tagger's panel is not in any page's markup: it hangs off `<body>`, it opens
 * on a press, and it is filled by an answer from the host. So this writes ONE
 * self-contained page with the real `media/afWiki.js` and the real stylesheet,
 * a row of turn bands to press, and a stub host that answers `wikiAsk` and
 * `wikiMark` exactly as `wikiMarkMessage` does.
 *
 *   node test/live_wiki.js && node test/shoot_page.js live_wiki
 *   node test/live_wiki.js --light && node test/shoot_page.js live_wiki --light
 *
 * `--open` opens the panel on load, which is what makes it photographable:
 * nothing can move a real pointer in a headless shot.
 *
 * Drive it by hand for the rest: press a badge, tick two chips, type a third,
 * press Enter. A kept turn's badge stays lit; pressing it again opens with its
 * own topics already ticked, because a second mark MERGES (B-14).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LIGHT = process.argv.includes('--light');
const OPEN = !process.argv.includes('--closed');

const DARK = `--vscode-editor-background:#1f1f1f; --vscode-foreground:#cccccc;
    --vscode-editorWidget-background:#252526; --vscode-widget-border:#454545;
    --vscode-descriptionForeground:#9d9d9d; --vscode-button-background:#0078d4;
    --vscode-button-foreground:#ffffff; --vscode-badge-background:#4d4d4d;
    --vscode-badge-foreground:#ffffff; --vscode-focusBorder:#0078d4;
    --vscode-errorForeground:#f48771; --vscode-editorWarning-foreground:#cca700;
    --vscode-list-hoverBackground:#2a2d2e; --vscode-editor-font-family:Consolas,monospace;
    --vscode-testing-iconPassed:#89d185;`;

const LIGHTVARS = `--vscode-editor-background:#ffffff; --vscode-foreground:#3b3b3b;
    --vscode-editorWidget-background:#f3f3f3; --vscode-widget-border:#c8c8c8;
    --vscode-descriptionForeground:#616161; --vscode-button-background:#005fb8;
    --vscode-button-foreground:#ffffff; --vscode-badge-background:#cccccc;
    --vscode-badge-foreground:#3b3b3b; --vscode-focusBorder:#005fb8;
    --vscode-errorForeground:#e51400; --vscode-editorWarning-foreground:#bf8803;
    --vscode-list-hoverBackground:#e8e8e8; --vscode-editor-font-family:Consolas,monospace;
    --vscode-testing-iconPassed:#2d883a;`;

/** The turns the page draws — one already kept, so both badge states are in the
 *  same picture rather than in two. */
const TURNS = [
    { n: 1, label: 'read note.txt and tell me what is in it' },
    { n: 2, label: 'now count the words in it' },
    { n: 3, label: 'wiki adaylarini isaretleyen rozeti ekle' }
];

const page = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Agent Farm — the wiki tagger, live</title>
<style>
:root { ${LIGHT ? LIGHTVARS : DARK} }
body { background:var(--vscode-editor-background); color:var(--vscode-foreground);
       font:13px "Segoe UI",sans-serif; padding:22px 24px; margin:0; }
h1 { font-size:15px; font-weight:600; margin:0 0 4px; }
p.sub { margin:0 0 18px; font-size:11px; color:var(--vscode-descriptionForeground); }
/* The transcript's own band, cut down to what the badge needs to sit in. */
.turnhdr { display:flex; align-items:center; gap:8px; padding:5px 9px; margin-bottom:5px;
    border:1px solid var(--vscode-widget-border); border-radius:5px;
    background:var(--vscode-editorWidget-background); font-size:12px; }
.turnnum { opacity:.75; white-space:nowrap; }
.turnlabel { opacity:.55; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#log { margin-top:14px; font:11px Consolas,monospace; color:var(--vscode-descriptionForeground); white-space:pre; }
${read('media/common.css')}
</style></head>
<body>
<h1>The wiki tagger</h1>
<p class="sub">K-26 — press a 🔖. Turn 2 is already kept, so both states are here.</p>
<div id="bands"></div>
<div id="log">nothing marked yet</div>
<script>${read('media/afTip.js')}</script>
<script>${read('media/afCombo.js')}</script>
<script>${read('media/afWiki.js')}</script>
<script>
try {
const TURNS = ${JSON.stringify(TURNS)};
// One mark already in the pool, on turn 2 — a lit badge and a quiet one, side
// by side, which is the comparison a picture of one state cannot make.
let marks = [{ id: 'w1', from: 2, to: 2, topics: ['Agent Farm', 'Wiki'], state: 'pending' }];
const say = t => { document.getElementById('log').textContent = t; };
const draw = () => {
    document.getElementById('bands').innerHTML = TURNS.map(t =>
        '<div class="turnhdr" data-turn="' + t.n + '">'
        + AFWiki.badge({ session: 'S1', turn: t.n, marks, text: t.label })
        + '<span class="turnnum">Turn ' + t.n + '/3</span>'
        + '<span class="turnlabel">' + t.label + '</span></div>').join('');
};
// The host, answering the way src/panels/base.ts does.
AFWiki.init(m => {
    if (m.type === 'wikiAsk') {
        setTimeout(() => AFWiki.receive({
            type: 'wikiAsk', session: 'S1', ok: true,
            from: m.turn, to: m.turn, exact: true, turnCount: TURNS.length,
            label: (TURNS.find(t => t.n === m.turn) || {}).label || '',
            topics: [
                { topic: 'Agent Farm', pending: 4, total: 11 },
                { topic: 'Wiki', pending: 2, total: 3 },
                { topic: 'Görev Yaşam Döngüsü', pending: 1, total: 6 },
                { topic: 'Token Ölçümü', pending: 0, total: 2 }
            ],
            // U-90 — the wiki's own folders, the other half of the picker's list.
            categories: [
                { name: 'Agent Farm', pages: 6 }, { name: 'Wiki', pages: 2 },
                { name: 'Kota', pages: 0 }, { name: 'Tarım', pages: 0 }
            ],
            marks
        }), 0);
    }
    // U-91 — the folder the picker offers to start. There is no disk here, so
    // it answers the shape the host answers.
    if (m.type === 'wikiCategory') {
        setTimeout(() => AFWiki.receive({
            type: 'wikiCategory', session: 'S1', ok: true,
            name: String(m.name || '').trim(), existed: false, marks
        }), 0);
    }
    if (m.type === 'wikiMark') {
        marks = marks.concat([{ id: 'w' + (marks.length + 1), from: m.from, to: m.to, topics: m.topics, state: 'pending' }]);
        say('kept turn ' + m.from + ' under: ' + m.topics.join(' · '));
        AFWiki.receive({
            type: 'wikiMarked', session: 'S1', ok: true, merged: false,
            pending: marks.length, from: m.from, to: m.to, marks, topics: []
        });
    }
}, (_s, fresh) => { marks = fresh; draw(); });
AFWiki.wire();
draw();
${OPEN ? `AFWiki.open({
    el: document.querySelector('.turnhdr[data-turn="3"] .afwiki'),
    session: 'S1', turn: 3, text: TURNS[2].label
});` : ''}
} catch (e) {
    document.getElementById('log').textContent = 'THREW: ' + (e && e.stack || e);
    document.title = 'LIVE WIKI FAILED';
}
</script>
</body></html>`;

fs.mkdirSync(path.join(ROOT, 'dist', 'render'), { recursive: true });
const out = path.join(ROOT, 'dist', 'render', `live_wiki${LIGHT ? '.light' : ''}.html`);
fs.writeFileSync(out, page, 'utf8');
console.log(out);
