// U-233 — a special block of Farm Settings is one card (media/afSettingSections.js cardHtml): a state dot, its name,
// one sentence of where it stands and its primary action on one line; the long explanation on the name's AFTip and
// the extra boxes behind Details. Driven on the real model (test/fixtures/allsettings.js), one block's data at a time.
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

// ---- Saved prompts and Superpowers: a group its card draws whole — the card names it, no heading above it
const PROMPTS = extra => Object.assign({ file: 'D:\\vault\\Prompts.md', source: 'setting', builtIn: 'D:\\b.md', empty: 0,
    items: [{ label: 'Review', group: 'Code', text: 'Read the flow before you change it.', line: 4 },
        { label: 'Turkish', group: 'Code', text: 'Answer in Turkish.', line: 9 }] }, extra);
const pcard = p => between(p, 'grp-general-prompts', 'class="setgroup"');
const general2 = pr => runPage(fx.script, Object.assign(fx.data(), { prompts: pr }), {}, { open: ['general'] });
{
    const p = general2(PROMPTS());
    const c = pcard(p);
    ok('Saved prompts: the group opens with its card, its heading not drawn twice', /^>\s*<div class="setcard" id="cat-prompts" data-state="ok" data-item="agentFarm\.promptSnippetsFile">/.test(c)
        && !/setgrouph/.test(c) && /class="setcardt">💬 Saved prompts</.test(c));
    ok('…its sentence is what was READ', /class="setcardsum">2 prompts read from the file you chose\.</.test(c));
    ok('…Choose, Open and Re-read on the same line', /class="setcardact"><button class="small" id="promptspick">📁 Change file…<\/button>[^]*id="promptsopen" (?!disabled)[^]*id="promptsreload"/.test(c));
    ok('…the group\'s about and the long explanation on the name\'s AFTip', /The file your saved prompts are read from/.test(c) && /pasted at the caret/.test(c));
    ok('…the path, its box and every prompt behind a closed Details', /data-card="cat-prompts" data-dflt="0"><summary>/.test(c)
        && c.indexOf('data-set="agentFarm.promptSnippetsFile"') > c.indexOf('<summary>') && /promptlbl">Review/.test(c));
    el(p, 'promptsreload').click();
    ok('Re-read still posts promptsReload', p.last().type === 'promptsReload');
    const off = pcard(general2(PROMPTS({ file: '', source: 'none', items: [] })));
    ok('no file is Off, said in one sentence, Open dead', /data-state="off"/.test(off) && /class="setcardsum">No prompts file yet\.</.test(off) && /id="promptsopen" disabled/.test(off));
    const none = pcard(general2(PROMPTS({ items: [] })));
    ok('a file with no fenced block is the warning', /data-state="warn"/.test(none) && /class="setcardsum">No prompt found in the file you chose/.test(none));
}
const SP = require('./fixtures/spsettings.js');
const spPage = sp => runPage(fx.script, Object.assign(SP.data(), { superpowers: sp }), {}, { open: ['agents'] });
const scard = p => between(p, 'grp-agents-superpowers', 'class="setgroup"');
{
    const p = spPage(SP.ready());
    const c = scard(p);
    ok('Superpowers: the group opens with its card, its heading not drawn twice', /^>\s*<div class="setcard" id="cat-superpowers" data-state="ok" data-item="agentFarm\.superpowersPath">/.test(c)
        && !/setgrouph/.test(c) && /class="setcardt">⚡ Superpowers</.test(c));
    ok('…its sentence: the skills behind the hook, and who starts with it on', /class="setcardsum">8 skills behind the hook; 1 of 5 agents start with it on\.</.test(c));
    ok('…Choose the folder, Re-scan and Reveal on the same line', /class="setcardact"><button class="secondary small" data-browse="agentFarm\.superpowersPath"[^]*id="sprescan"[^]*id="spreveal" (?!disabled)/.test(c));
    ok('…the hook, the skills and the agent matrix behind a closed Details, the group\'s rows after the card',
        /data-card="cat-superpowers" data-dflt="0"><summary>/.test(c) && c.indexOf('data-spagent=') > c.indexOf('<summary>')
        && c.indexOf('data-reset="agentFarm.superpowersPath"') > c.indexOf('<summary>') && c.lastIndexOf('data-item="agentFarm.superpowers') > c.indexOf('</details>'));
    el(p, 'sprescan').click();
    ok('Re-scan still posts spRescan', p.last().type === 'spRescan');
    const nohook = scard(spPage(SP.noHook()));
    ok('a folder with no hook is the warning, Details open on why a session gets nothing', /data-state="warn"/.test(nohook)
        && /class="setcardsum">The folder has no hook, so a session switched on is given nothing\.</.test(nohook) && /data-dflt="1" open>/.test(nohook) && /given nothing at all from here/.test(nohook));
    const gone = scard(spPage(SP.missing()));
    ok('a folder not on this machine is Off, Reveal dead', /data-state="off"/.test(gone) && /not on this machine/.test(gone) && /id="spreveal" disabled/.test(gone));
}

// ---- Flow (the preferences) and Sound
const FLOW = require('./fixtures/flowsettings.js');
{
    const p = runPage(FLOW.script, FLOW.data(), {}, { open: ['sessions'] });
    const c = between(p, 'grp-sessions-flex', 'class="setgroup"');
    ok('Preferences: the group opens with its card', /^>\s*<div class="setcard" id="cat-flex" data-state="ok" data-item="agentFarm\.flex/.test(c)
        && !/setgrouph/.test(c) && /class="setcardt">🎚 Preferences</.test(c));
    ok('…its sentence: how many you set, and the preset they match', /class="setcardsum">0 of 81 set by you; they match the preset Balanced\.</.test(c));
    ok('…the table and the presets behind a closed Details', /data-card="cat-flex" data-dflt="0"><summary>/.test(c) && c.indexOf('class="flextable"') > c.indexOf('<summary>'));
    const d = FLOW.data();
    d.flex.points[0].from = 'settings';
    d.flex.presets.forEach(x => { x.matches = false; });
    const own = between(runPage(FLOW.script, d, {}, { open: ['sessions'] }), 'grp-sessions-flex', 'class="setgroup"');
    ok('…a value of your own that matches no preset is said so', /class="setcardsum">1 of 81 set by you; no preset matches them\.</.test(own));
    const r = runPage(FLOW.script, FLOW.data(), {}, { open: ['sessions'] });
    r.send({ type: 'error', key: 'flex', error: 'not a valid number' });
    const bad = between(r, 'grp-sessions-flex', 'class="setgroup"');
    ok('a refusal is the warning: the sentence says it once, Details open on the table', /data-state="warn"/.test(bad)
        && /class="setcardsum">not a valid number</.test(bad) && /data-dflt="1" open>/.test(bad) && !/class="flexerr"/.test(bad));
}
const AL = require('./fixtures/alertsettings.js');
{
    const p = runPage(AL.script, AL.inUse(), {}, { open: ['notify'] });
    const c = between(p, 'grp-notify-sound', 'class="setgroup"');
    ok('Sound: the group opens with its card, the deep link on the old key', /^>\s*<div class="setcard" id="cat-sound" data-state="ok" data-item="agentFarm\.alerts\.voices">/.test(c)
        && !/setgrouph/.test(c) && /class="setcardt">🔊 Sound</.test(c));
    ok('…its sentence: the state, then what differs from out of the box', /class="setcardsum">On · rings on 4 events/.test(c));
    ok('…Open Sound on the same line, and no Details: the controls live on the Sound page',
        /class="setcardact"><button class="secondary small" data-afnav="sound"/.test(c) && !/setcarddet/.test(c));
    const all = between(runPage(fx.script, Object.assign(fx.data(), { alerts: AL.inUse().alerts }), {}, { open: ['notify'], more: ['notify'] }),
        'grp-notify-sound', 'class="setgroup"');
    ok('…on the real model the group\'s other rows follow the card', /^>\s*<div class="setcard" id="cat-sound"/.test(all)
        && all.indexOf('data-item="agentFarm.alerts.toneVolume"') > all.indexOf('class="setcardsum"'));
}

// ---- Wiki, Telegram and Gatekeeper
const W = require('./fixtures/wikisettings.js');
const wiki = w => between(runPage(W.script, Object.assign(W.data(), w ? { wiki: w } : {}), {}, { open: ['knowledge'] }), 'grp-knowledge-wiki', 'class="setgroup"');
{
    const c = wiki();
    ok('Wiki: the group opens with its card, the deep link on the root', /^>\s*<div class="setcard" id="cat-wiki" data-state="ok" data-item="agentFarm\.wikiRoot">/.test(c)
        && !/setgrouph/.test(c) && /class="setcardt">📚 Wiki</.test(c));
    ok('…its sentence: pages and categories', /class="setcardsum">22 pages in 5 categories\.</.test(c));
    ok('…Choose the folder, Re-scan and Open the cockpit on the line; Start only when something is missing',
        /class="setcardact">\s*<button class="secondary small" data-browse="agentFarm\.wikiRoot"[^]*id="wikirescan"[^]*id="wikiopen"/.test(c) && !/id="wikiinit"/.test(c));
    ok('…the files, the categories and Reveal behind a closed Details', /data-card="cat-wiki" data-dflt="0"><summary>/.test(c)
        && c.indexOf('class="wikifiles"') > c.indexOf('<summary>') && c.indexOf('id="wikireveal"') > c.indexOf('<summary>'));
    const law = wiki(W.noLaw());
    ok('no law in the folder is the warning: Start on the line, Details open on why every compile refuses', /data-state="warn"/.test(law)
        && /class="setcardsum">The vault's own law is not in this folder, so every compile refuses\.</.test(law)
        && /class="setcardact"><button class="small" id="wikiinit"/.test(law) && /data-dflt="1" open>/.test(law) && /every compile refuses without it/.test(law));
    const gone = wiki(W.missing());
    ok('a folder not there yet is Off, Reveal dead', /data-state="off"/.test(gone) && /Nothing is at the wiki folder yet\./.test(gone) && /id="wikireveal" disabled/.test(gone));
}
const G = require('./fixtures/tgsettings.js');
const tgv = id => G.variants().find(v => v.id === id).data;
{
    const p = runPage(G.script, tgv('tgsettings'), {}, { open: ['remote'] });
    const c = between(p, 'grp-remote-telegram', 'class="setgroup"');
    ok('Telegram: the group opens with its card', /^>\s*<div class="setcard" id="cat-telegram" data-state="ok" data-item="agentFarm\.telegram\./.test(c)
        && !/setgrouph/.test(c) && /class="setcardt">📱 Telegram</.test(c));
    ok('…its sentence: the state in words, the bot, the bridge\'s own sentence', /class="setcardsum">Connected \(@muvu_farm_bot\): /.test(c));
    ok('…verify and connect on the line, the figures behind a closed Details, the four rows after the card',
        /class="setcardact"><button class="secondary small" data-svc="verify">/.test(c) && /data-card="cat-telegram" data-dflt="0"><summary>/.test(c)
        && c.indexOf('class="svc-facts"') > c.indexOf('<summary>') && c.lastIndexOf('data-item="agentFarm.telegram.enabled"') > c.indexOf('</details>'));
    const none = between(runPage(G.script, tgv('tgsettings-notoken'), {}, { open: ['remote'] }), 'grp-remote-telegram', 'class="setgroup"');
    ok('no token is the warning, Details open on what to press next', /data-state="warn"/.test(none) && /data-dflt="1" open>/.test(none) && /Connect Telegram/.test(none));
}
const K = require('./fixtures/kapicisettings.js');
{
    const p = runPage(K.script, K.data(), K.window, { open: ['gatekeeper'] });
    const c = between(p, 'cat-gatekeeper', 'class="setgroup"');
    ok('Gatekeeper: the section opens with its card', /<div class="setcard" id="cat-gatekeeper" data-state="off">/.test(p.html()) && /class="setcardt">🛡 Gatekeeper</.test(c));
    ok('…no key is Off, said in one sentence', /class="setcardsum">No key, so every question goes down its rule's failure path/.test(c));
    ok('…the Secret vault on the line, the key, rules, agreement and MCP chips behind a closed Details, not a second vault button',
        /class="setcardact"><button id="kpc-secrets" class="secondary small"/.test(c) && /data-card="cat-gatekeeper" data-dflt="0"><summary>/.test(c)
        && c.indexOf('class="kpc-head"') > c.indexOf('<summary>') && (c.match(/id="kpc-secrets"/g) || []).length === 1);
    el(p, 'kpc-secrets').click();
    ok('Secret vault still posts openSecrets', p.last().type === 'openSecrets');
    const d = K.data();
    d.kapici.key.present = true;
    const on = between(runPage(K.script, d, K.window, { open: ['gatekeeper'] }), 'cat-gatekeeper', 'class="setgroup"');
    ok('with a key it is ready: the rules and what was compared', /^ data-state="ok">/.test(on) && /class="setcardsum">Key present · 3 rules · nothing compared yet\.</.test(on));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
