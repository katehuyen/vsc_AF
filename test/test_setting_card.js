// U-233 — a special block of Farm Settings is one card (media/afSettingSections.js cardHtml): a state dot, its name,
// one sentence of where it stands and its primary action on one line; the long explanation on the name's AFTip and
// the extra boxes behind Details. Driven on the real model (test/fixtures/allsettings.js) with "Open with" data.
const { runPage } = require('./lib_page_dom.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const fx = require('./fixtures/allsettings.js');
const docOpen = extra => Object.assign({ defaultMode: 'preview', modes: ['vscode', 'preview', 'obsidian', 'custom'], customCommand: '', customArgs: '{file}' }, extra || {});
function general(d) {
    const p = runPage(fx.script, Object.assign(fx.data(), { docOpen: d }), {}, {});
    p.query('[data-fold]').find(b => b.dataset.fold === 'general').click();
    return p;
}
const card = p => (p.html().split('id="cat-docopen"')[1] || '').split('class="setgroup"')[0];
const el = (p, id) => p.sandbox.document.getElementById(id);

{
    const p = general(docOpen());
    const c = card(p);
    ok('"Open with" is a card under its old anchor, at the head of General',
        /<div class="setcard" id="cat-docopen" data-state="ok">/.test(p.html()) && p.html().indexOf('id="cat-docopen"') < p.html().indexOf('class="setgroup"'));
    ok('…a state dot a screen reader can read, then the name', /class="setcardst st-ok" role="img" aria-label="Ready"/.test(c) && /class="setcardt">📄 Open documents with</.test(c));
    ok('…one sentence of where it stands, naming the app', /class="setcardsum">Every Open button uses Markdown preview \(rendered\)\.</.test(c));
    ok('…its primary control on the same line', /class="setcardact"><select id="docopenmode"/.test(c));
    ok('…the long explanation on the name\'s AFTip, not on the page', /af-tipw tip-free/.test(c) && /travel between machines/.test(c) && !/<p class="muted small"/.test(c));
    ok('…the extra boxes behind a closed Details', /<details class="setcarddet" data-card="cat-docopen" data-dflt="0"><summary>Details<\/summary>/.test(c) && /id="docopencmd"/.test(c));
    el(p, 'docopenmode').value = 'obsidian';
    el(p, 'docopenmode').fire('change');
    ok('choosing an app still posts what it always did', p.posted.some(m => m.type === 'docOpenSet' && m.field === 'defaultMode' && m.value === 'obsidian'));
}
{
    const c = card(general(docOpen({ defaultMode: 'custom' })));
    ok('a custom app with no command is the one warning: the dot and the sentence say so',
        /data-state="warn"/.test(c) && /aria-label="Needs a look"/.test(c) && /Custom app is chosen, but no command is set\./.test(c));
    ok('…and Details opens on the boxes that fix it', /<details class="setcarddet" data-card="cat-docopen" data-dflt="1" open>/.test(c) && /id="docopencustom" style="margin-top:10px; "/.test(c));
    const set = card(general(docOpen({ defaultMode: 'custom', customCommand: 'notepad.exe' })));
    ok('with a command set it is ready again', /data-state="ok"/.test(set) && /value="notepad.exe"/.test(set));
}

// ---- Agent folders: the roots and their agents behind Details, the warning a reader must act on in the sentence
const agent = (dir, name) => ({ dir, name, excluded: false, agentId: 'id-' + name });
const NEST = { root: 'D:/a', kind: 'nest', duplicate: false, candidates: [agent('D:/a/dev', 'dev'), agent('D:/a/ops', 'ops')] };
const folders = reports => ({ reports, excludes: [] });
const agents = (f, state) => runPage(fx.script, Object.assign(fx.data(), { folders: f }), {}, state || { open: ['agents'] });
const fcard = p => (p.html().split('id="cat-folders"')[1] || '').split('class="setgroup"')[0];
const det = p => p.query('[data-card="cat-folders"]')[0];
{
    const p = agents(folders([NEST]));
    const c = fcard(p);
    ok('"Agent folders" is a card under its old anchor', /<div class="setcard" id="cat-folders" data-state="ok">/.test(p.html()) && /class="setcardt">📁 Agent folders</.test(c));
    ok('…its sentence counts the agents and the folders', /class="setcardsum">2 agents found in one folder\.</.test(c));
    ok('…+ Add folder on the same line', /class="setcardact"><button class="secondary small" id="rootadd"/.test(c));
    ok('…the long explanation on the name\'s AFTip, naming the setting new agents start from', /af-tipw tip-free/.test(c) && /New agent model/.test(c) && !/<p class="muted small"/.test(c));
    ok('…the roots and their agents behind a closed Details', /<details class="setcarddet" data-card="cat-folders" data-dflt="0"><summary>/.test(c)
        && c.indexOf('data-rootreveal="D:/a"') > c.indexOf('<summary>') && /data-agmodel="D:\/a\/dev"/.test(c));
    el(p, 'rootadd').click();
    ok('+ Add folder still posts rootAdd', p.last().type === 'rootAdd');
    // the hand opens Details, then a pick inside it redraws the page: it stays open, and the state remembers it
    const d = det(p);
    d.open = true;
    d.fire('toggle');
    p.send({ type: 'data', data: { folders: folders([NEST]) } });
    ok('Details the hand opened stays open across the redraw', /data-card="cat-folders" data-dflt="0" open>/.test(fcard(p))
        && JSON.stringify(p.state().cards['cat-folders']) === '{"open":true,"dflt":false}');
    det(p).open = false;
    det(p).fire('toggle');
    p.send({ type: 'data', data: { folders: folders([NEST, { root: 'D:/gone', kind: 'missing', duplicate: false, candidates: [] }]) } });
    ok('…and a warning that appears opens it again, though the hand had closed it (a new default wins)', /data-state="warn"/.test(fcard(p))
        && /data-card="cat-folders" data-dflt="1" open>/.test(fcard(p)));
}
{
    const dup = fcard(agents(folders([NEST, Object.assign({}, NEST, { root: 'd:/a', duplicate: true, candidates: [] })])));
    ok('a folder listed twice is the warning: the sentence, Clean duplicates beside + Add folder, Details open on the badge', /data-state="warn"/.test(dup)
        && /class="setcardsum">The same folder is listed more than once/.test(dup) && /id="rootadd"[^]*id="afcleandupes"[^]*<\/span>\s*<\/div>\s*<details/.test(dup)
        && /data-dflt="1" open>/.test(dup) && /duplicate entry/.test(dup));
    const gone = fcard(agents(folders([NEST, { root: 'D:/gone', kind: 'missing', duplicate: false, candidates: [] }])));
    ok('a folder that does not exist is said in one sentence', /class="setcardsum">One folder on the list does not exist on this machine\.</.test(gone) && !/afcleandupes/.test(gone));
    const none = fcard(agents(folders([])));
    ok('no folder at all warns too', /data-state="warn"/.test(none) && /class="setcardsum">No folder is scanned for agents yet\.</.test(none));
    const p = agents(folders([NEST, { root: 'D:/b', kind: 'nest', duplicate: false, candidates: [agent('D:/b/web', 'web')] }]));
    el(p, 'filter').value = 'web';
    el(p, 'filter').fire('input');
    ok('under a query the card opens on the roots that answer it', /data-dflt="1" open>/.test(fcard(p)) && /data-rootreveal="D:\/b"/.test(fcard(p)) && !/data-rootreveal="D:\/a"/.test(fcard(p)));
}

// ---- Engines and Claude Code: the head of Engines & Accounts
const ENGINES = require('./fixtures/engines.js').engines;
const CC = require('../out/core/claudesettings.js');
const claude = extra => Object.assign({ file: 'C:/u/.claude/settings.json', parseError: '', raw: '{\n  "model": "opus"\n}',
    items: JSON.parse(JSON.stringify(CC.buildClaudeModel({ model: 'opus', env: { CLAUDE_CODE_USE_POWERSHELL_TOOL: '1' } }))) }, extra);
const accounts = d => runPage(fx.script, Object.assign(fx.data(), { engines: ENGINES(), claude: claude() }, d), {}, { open: ['engines'] });
const between = (p, a, b) => (p.html().split(`id="${a}"`)[1] || '').split(b)[0];
{
    const p = accounts();
    const e = between(p, 'cat-engines', 'id="cat-claude"');
    ok('Engines is a card under its old anchor, before Claude Code', /<div class="setcard" id="cat-engines" data-state="ok">/.test(p.html())
        && p.html().indexOf('id="cat-engines"') < p.html().indexOf('id="cat-claude"') && /class="setcardt">⚙ Engines</.test(e));
    ok('…its sentence: how many run, and how many on a plan', /class="setcardsum">4 of 5 ready, 2 of them on a plan rather than per token\.</.test(e));
    ok('…Open Engines then Open Accounts on the same line', /class="setcardact"><button class="small" id="openengines"[^]*id="openaccounts"[^]*<\/span>\s*<\/div>\s*<details/.test(e));
    ok('…the rows read off disk behind a closed Details', /data-card="cat-engines" data-dflt="0"><summary>/.test(e) && e.indexOf('data-engdocs') > e.indexOf('<summary>'));
    el(p, 'openengines').click();
    ok('Open Engines still posts openEngines', p.last().type === 'openEngines');
    const none = between(accounts({ engines: ENGINES().map(x => Object.assign(x, { ready: false })) }), 'cat-engines', 'id="cat-claude"');
    ok('no engine ready is the warning, Details open on the rows that say what to do', /data-state="warn"/.test(none)
        && /class="setcardsum">None of the 5 engines can run on this machine yet\.</.test(none) && /data-dflt="1" open>/.test(none));

    const c = between(p, 'cat-claude', 'class="setgroup"');
    const set = claude().items.filter(it => it.set).length;
    ok('Claude Code is a card under its old anchor', /<div class="setcard" id="cat-claude" data-state="ok">/.test(p.html()) && /class="setcardt">📝 Claude Code \(claude CLI\)</.test(c));
    ok('…its sentence counts what its settings.json sets', new RegExp(`class="setcardsum">${set} of the ${claude().items.length} settings here are set in its settings\\.json; the rest are its own defaults\\.<`).test(c));
    ok('…Open the file on the same line, the file and the backup on the name\'s AFTip', /class="setcardact"><button class="secondary small" id="ccopen"/.test(c)
        && /af-tipw tip-free/.test(c) && /C:\/u\/\.claude\/settings\.json/.test(c) && /\.agentfarm-backup/.test(c));
    ok('…its rows and the raw settings.json editor, still folded, behind a closed Details', /data-card="cat-claude" data-dflt="0"><summary>/.test(c)
        && c.indexOf('data-ccset="psTool"') > c.indexOf('<summary>') && /<details class="setitem" id="ccrawbox"/.test(c));
    el(p, 'ccopen').click();
    ok('Open the file still posts ccOpenFile', p.last().type === 'ccOpenFile');
    p.send({ type: 'error', key: 'cc:model', error: 'refused' });
    ok('a refused edit opens Details on the row that says so', /data-card="cat-claude" data-dflt="1" open>/.test(between(p, 'cat-claude', 'class="setgroup"')));
    const bad = between(accounts({ claude: claude({ parseError: 'Unexpected token' }) }), 'cat-claude', 'class="setgroup"');
    ok('a settings.json that does not parse is the warning, Details open on the raw editor', /data-state="warn"/.test(bad)
        && /class="setcardsum">Its settings\.json could not be parsed, so edits are blocked until the raw editor fixes it\.</.test(bad)
        && /data-dflt="1" open>/.test(bad) && /Unexpected token/.test(bad));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
