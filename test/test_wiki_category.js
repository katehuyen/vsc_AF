// U-125 — RENAMING OR MERGING A WIKI CATEGORY MOVES ALL THREE PLACES IT LIVES.
//
// ‼️ WHAT THIS FILE IS THE PROOF OF. A category is a folder under the wiki
// root, a `## <Category>` section in index.md, and the topic of every mark the
// next compile will file under it. Renamed in one place and not the others,
// the index names a heading with no folder and the next compile re-opens the
// folder somebody just renamed. So every case below reads all three.
//
// And a merge is the one outcome renaming back cannot undo: a clash has to stop
// it BEFORE anything moves, which is pinned by reading both folders after the
// refusal, not by trusting the error.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));
const C = require(path.join(ROOT, 'out', 'core', 'wikiCategory.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wikicat-'));
let n = 0;
const INDEX = [
    '# 00_WIKI — İndeks',
    '',
    'Kategorilere göre kavram sayfaları.',
    '',
    '## Teknoloji',
    '- [[Drone]] — neden geç geldi.',
    '- [[Bulut]] — kimin bilgisayarı.',
    '',
    '## Tarım',
    '- [[Sulama]] — damla sulama.',
    '- [[Drone]] — tarlada ilaçlama.',
    '',
    '## Felsefe',
    '- [[Akıl]] — ne olduğu.',
    ''
];

function makeWiki(opts = {}) {
    const root = path.join(TMP, 'w' + (++n));
    const eol = opts.crlf ? '\r\n' : '\n';
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(root, '_KURALLAR_'));
    for (const [cat, pages] of Object.entries(opts.folders || { Teknoloji: ['Drone', 'Bulut'], Tarım: ['Sulama'], Felsefe: ['Akıl'] })) {
        fs.mkdirSync(path.join(root, cat));
        for (const p of pages) { fs.writeFileSync(path.join(root, cat, p + '.md'), `# ${p}\n`); }
    }
    if (opts.index !== false) { fs.writeFileSync(path.join(root, 'index.md'), (opts.index || INDEX).join(eol)); }
    fs.writeFileSync(path.join(root, 'log.md'), ['# Log', '', '## [2026-08-22] compile | Drone', '- ok', ''].join(eol));
    const store = new W.WikiStore(path.join(root, '..', `pool${n}.json`));
    const mark = (topics, extra = {}) => store.add({
        sessionId: 's' + Math.random(), sessionFile: '', engine: 'claude', agentName: 'x',
        fromTurn: 0, toTurn: 0, topics, label: '', addedBy: 'agent', ...extra
    }).candidate;
    return { root, store, mark };
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const dirs = root => fs.readdirSync(root).filter(d => fs.statSync(path.join(root, d)).isDirectory()).sort();

// ============================================================ a plain rename
{
    const { root, store, mark } = makeWiki();
    const a = mark(['Tarım', 'Su']);
    const b = mark(['tarım', 'Tarım Makineleri']);
    const c = mark(['Felsefe']);
    a.state = 'compiled'; a.pages = ['Tarım/Sulama.md', path.join(root, 'Tarım', 'Sulama.md'), 'Felsefe/Akıl.md'];
    store.save();
    const r = C.renameWikiCategory(root, store, 'tarım', 'Ziraat');
    ok('a rename answers ok, spelled as the category was found', r.ok && r.from === 'Tarım' && r.to === 'Ziraat');
    ok('…it is not a merge', r.merged === false && r.folder === 'renamed' && r.index === 'renamed');
    ok('the folder has the new name and keeps its pages',
        dirs(root).includes('Ziraat') && !dirs(root).includes('Tarım') && fs.existsSync(path.join(root, 'Ziraat', 'Sulama.md')));
    const idx = read(root, 'index.md');
    ok('the index heading moved with it', /^## Ziraat$/m.test(idx) && !/^## Tarım$/m.test(idx));
    ok('…and nothing else in the index changed', idx === INDEX.join('\n').replace('## Tarım', '## Ziraat'));
    ok('every mark in every spelling is re-filed', a.topics.join('|') === 'Ziraat|Su' && b.topics.join('|') === 'Ziraat|Tarım Makineleri');
    ok('a mark under another category is left alone', c.topics.join('|') === 'Felsefe');
    ok('‼️ the provenance of a compiled mark follows the folder, relative and absolute',
        a.pages[0] === 'Ziraat/Sulama.md' && a.pages[1] === path.join(root, 'Ziraat', 'Sulama.md') && a.pages[2] === 'Felsefe/Akıl.md');
    ok('…and it counts the marks it changed', r.marks === 2);
    const saved = JSON.parse(fs.readFileSync(path.join(root, '..', `pool${n}.json`), 'utf8')).candidates;
    ok('the pool is saved, not only changed in memory', saved.some(x => x.topics.includes('Ziraat')) && !saved.some(x => x.topics.includes('Tarım')));
    ok('the log records it, appended', /## \[\d{4}-\d\d-\d\d\] rename \| Tarım → Ziraat/.test(read(root, 'log.md'))
        && read(root, 'log.md').startsWith('# Log') && r.logged === true);
    ok('the answer carries the shape check', r.lint && typeof r.lint.pages === 'number' && Array.isArray(r.lint.unindexed));
}

// ================================================ a case-only rename, CRLF index
{
    const { root, store, mark } = makeWiki({ crlf: true });
    const m = mark(['felsefe']);
    const r = C.renameWikiCategory(root, store, 'Felsefe', 'FELSEFE');
    ok('a case-only rename is a rename', r.ok && r.to === 'FELSEFE' && r.folder === 'renamed' && !r.merged);
    ok('…and the folder really has the new case', dirs(root).includes('FELSEFE') && !dirs(root).includes('Felsefe'));
    ok('no hop folder is left behind', !dirs(root).some(d => /\.rename-/.test(d)));
    const idx = read(root, 'index.md');
    ok('‼️ the index keeps its CRLF line endings', /## FELSEFE\r\n/.test(idx) && !/[^\r]\n/.test(idx));
    ok('the mark takes the new spelling', m.topics.join('|') === 'FELSEFE');
    ok('the same name exactly is refused', C.renameWikiCategory(root, store, 'FELSEFE', 'FELSEFE').ok === false);
}

// ================================================================== a merge
{
    const { root, store, mark } = makeWiki({ folders: { Teknoloji: ['Drone', 'Bulut'], Tarım: ['Sulama', 'Toprak'], Felsefe: ['Akıl'] } });
    fs.writeFileSync(path.join(root, 'Tarım', 'resim.png'), 'x');
    const m = mark(['Tarım', 'Teknoloji']);
    const r = C.renameWikiCategory(root, store, 'Tarım', 'teknoloji');
    ok('a name that exists in any spelling is a merge into THAT spelling', r.ok && r.merged && r.to === 'Teknoloji' && r.folder === 'merged');
    ok('every entry moved, not only pages', r.moved.sort().join('|') === 'Sulama.md|Toprak.md|resim.png'
        && fs.existsSync(path.join(root, 'Teknoloji', 'resim.png')));
    ok('the emptied source folder is gone', !dirs(root).includes('Tarım'));
    ok('the target kept its own pages', fs.existsSync(path.join(root, 'Teknoloji', 'Drone.md')));
    const idx = read(root, 'index.md');
    const sec = idx.split('## Teknoloji\n')[1].split('\n## ')[0];
    ok('the two index sections became one', !/^## Tarım$/m.test(idx) && r.index === 'merged');
    ok('‼️ items are unioned by the page they link — Drone once', (sec.match(/\[\[Drone\]\]/g) || []).length === 1);
    ok('…and sorted', sec.trim().split('\n').map(l => /\[\[([^\]]+)/.exec(l)[1]).join('|') === 'Bulut|Drone|Sulama');
    ok('the sections around it are untouched', idx.startsWith('# 00_WIKI — İndeks\n\nKategorilere') && /## Felsefe\n- \[\[Akıl\]\] — ne olduğu\.\n$/.test(idx));
    ok('a mark carrying both names carries the target once', m.topics.join('|') === 'Teknoloji');
    ok('the log says merge', /merge \| Tarım → Teknoloji/.test(read(root, 'log.md')));
}

// ======================================================= a clash stops a merge
{
    const { root, store, mark } = makeWiki({ folders: { Teknoloji: ['Drone', 'Bulut'], Tarım: ['drone', 'Sulama'] } });
    const m = mark(['Tarım']);
    const before = read(root, 'index.md');
    const r = C.renameWikiCategory(root, store, 'Tarım', 'Teknoloji');
    ok('a page name present in both refuses the merge', r.ok === false && /drone\.md/.test(r.error) && r.clashes.join('|') === 'drone.md');
    ok('‼️ …before ANYTHING moved', fs.readdirSync(path.join(root, 'Tarım')).sort().join('|') === 'Sulama.md|drone.md'
        && fs.readdirSync(path.join(root, 'Teknoloji')).sort().join('|') === 'Bulut.md|Drone.md');
    ok('…and the index and the pool are untouched', read(root, 'index.md') === before && m.topics.join('|') === 'Tarım');
    ok('…and nothing is logged', !/Tarım →/.test(read(root, 'log.md')));
}

// ===================================================== what is refused by name
{
    const { root, store } = makeWiki();
    const no = (a, b) => C.renameWikiCategory(root, store, a, b);
    ok('an empty target is refused', no('Tarım', '  ').ok === false);
    ok('a target that is nothing once cleaned is refused', no('Tarım', '::').ok === false);
    ok('the wiki\'s own _ prefix is refused as a target', no('Tarım', '_Gizli').ok === false);
    ok('…and as a source', no('_KURALLAR_', 'Kurallar').ok === false && dirs(root).includes('_KURALLAR_'));
    ok('a device name Windows reserves is refused', no('Tarım', 'CON').ok === false);
    ok('an unknown category is refused by name', /No category "Yok"/.test(no('Yok', 'Var').error || ''));
    ok('a missing root is refused', C.renameWikiCategory(path.join(root, 'nope'), store, 'Tarım', 'X').ok === false);
    ok('a separator becomes part of ONE name, never a nested folder',
        no('Tarım', 'Tarım / Su').ok && dirs(root).includes('Tarım Su'));
    ok('createWikiCategory still refuses what it refused', W.createWikiCategory(root, 'CON').ok === false
        && W.createWikiCategory(root, '_X').ok === false && W.checkCategoryName('a/b').name === 'a b');
}

// ================================ a topic with no folder, and a wiki with no index
{
    const { root, store, mark } = makeWiki({ index: false });
    const m = mark(['Kuantum']);
    const r = C.renameWikiCategory(root, store, 'kuantum', 'Fizik');
    ok('a pool topic with no folder is still renamed', r.ok && r.folder === 'none' && m.topics.join('|') === 'Fizik');
    ok('…no folder is invented for it', !dirs(root).includes('Fizik'));
    ok('a wiki with no index says so rather than making one', r.index === 'missing' && !fs.existsSync(path.join(root, 'index.md')));
}

// ======================================================= the index, as text
{
    const t = '## A\n- [[x]] — 1\n## B\n- [[y]] — 2\n';
    ok('a section with no heading for it is left alone', C.renameIndexSection(t, 'Q', 'R').did === 'none');
    ok('merging a last section into an earlier one keeps the final newline',
        C.renameIndexSection(t, 'B', 'A').text === '## A\n- [[x]] — 1\n- [[y]] — 2\n');
    ok('a ### sub-heading is not a category', C.renameIndexSection('### A\n- x\n', 'A', 'B').did === 'none');
}

// ================================================================ the bridge
(async () => {
    const { root, store } = makeWiki();
    const bridge = new BridgeRegistry();
    C.registerWikiCategoryOps(bridge, { root: () => root, store: () => store });
    ok('wiki.category.rename is on the bridge with its args described',
        bridge.catalog().some(o => o.op === 'wiki.category.rename' && /args: from, to/.test(o.describe)));
    const good = await bridge.dispatch('wiki.category.rename', { from: 'Felsefe', to: 'Düşünce' });
    ok('the op renames through the same body', good.ok && good.result.to === 'Düşünce' && dirs(root).includes('Düşünce'));
    fs.writeFileSync(path.join(root, 'Düşünce', 'Drone.md'), 'x');
    const bad = await bridge.dispatch('wiki.category.rename', { from: 'Düşünce', to: 'Teknoloji' });
    ok('a refused merge comes back as an error naming the clash', !bad.ok && /Drone\.md/.test(bad.error || ''));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host registers it beside the other wiki ops',
        /registerWikiOps\(bridge, wikiDeps\);\s*\n\s*registerWikiCategoryOps\(bridge, wikiDeps\);/.test(ext));
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'parity.manifest.json'), 'utf8'));
    ok('the page\'s door is mapped to the op in the parity manifest',
        manifest.entries.some(e => (e.ui || []).includes('page:wikiPanel.ts#renameCategory') && (e.ops || []).includes('wiki.category.rename')));

    // ============================================== the host's questions
    const said = [];
    let quick = 0, answer = '', confirm = 'Merge', validated = [];
    const fakeVscode = {
        InputBoxValidationSeverity: { Warning: 2 },
        window: {
            showInformationMessage: (m) => { said.push(m); },
            showQuickPick: async (items) => { said.push(items.map(i => i.label).join('|')); return items[quick]; },
            showInputBox: async (o) => { validated = [o.validateInput(''), o.validateInput(o.value), o.validateInput('teknoloji'), o.validateInput('Yeni')]; return answer; },
            showWarningMessage: async (m) => { said.push(m); return confirm; }
        }
    };
    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') { return fakeVscode; }
        return origLoad.call(this, request, parent, isMain);
    };
    const P = require(path.join(ROOT, 'out', 'panels', 'wikiCategoryPrompt.js'));
    const choices = P.categoryChoices([{ name: 'Teknoloji', pages: 2 }, { name: 'Tarım', pages: 1 }],
        [{ topic: 'teknoloji', total: 3 }, { topic: 'Kuantum', total: 1 }]);
    ok('the choices are the union the filter offers, one row per name',
        choices.map(c => `${c.name}:${c.pages}:${c.marks}`).join('|') === 'Kuantum:0:1|Tarım:1:0|Teknoloji:2:3');
    answer = 'Ziraat';
    const r1 = await P.askCategoryRename(choices, 'tarım');
    ok('the filtered topic is offered first', said[said.length - 1] === 'Tarım|Kuantum|Teknoloji');
    ok('a plain rename is not confirmed — renaming back undoes it', r1 && r1.from === 'Tarım' && r1.to === 'Ziraat'
        && !said.some(s => /^Merge/.test(s)));
    ok('the box refuses an empty name and the same name', typeof validated[0] === 'string' && typeof validated[1] === 'string');
    ok('‼️ …and warns, as you type, that an existing name MERGES', validated[2] && validated[2].severity === 2
        && /MERGES "Tarım" into it/.test(validated[2].message) && validated[3] === null);
    answer = 'teknoloji'; confirm = undefined;
    ok('‼️ a merge waits for the modal and stops without it', await P.askCategoryRename(choices, 'Tarım') === undefined
        && said.some(s => s === 'Merge "Tarım" into "Teknoloji"?'));
    confirm = 'Merge';
    const r3 = await P.askCategoryRename(choices, 'Tarım');
    ok('…and goes on with it', r3 && r3.to === 'teknoloji');
    ok('an empty wiki says so rather than opening an empty pick', await P.askCategoryRename([], '') === undefined
        && /no category yet/.test(said[said.length - 1]));
    Module._load = origLoad;

    // ================================================================ the page
    const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
    const fixture = require(path.join(__dirname, 'fixtures', 'wiki.js'));
    const NOW = { setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => { } };
    const pg = runPage('wiki.js', fixture.data(), NOW);
    const btn = pg.query('#wk-rencat')[0];
    ok('the cockpit has a rename button beside Lint', !!btn && /Rename category/.test(pg.html()));
    btn.fire('click');
    ok('with no single topic filtered it names none', pg.last().type === 'renameCategory' && pg.last().from === '');
    const one = runPage('wiki.js', fixture.data(), NOW, { fTopic: ['Wiki Derleme'] });
    one.query('#wk-rencat')[0].fire('click');
    ok('with one topic filtered it names that one', one.last().from === 'Wiki Derleme');
    one.send({ type: 'categoryRenamed', from: 'wiki derleme', to: 'Wiki' });
    ok('‼️ a filter left on the old name follows the rename', JSON.stringify(one.state().fTopic) === '["Wiki"]');
    const wikiPanel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'wikiPanel.ts'), 'utf8');
    ok('the panel answers the button with the same body the op calls',
        /case 'renameCategory':[\s\S]{0,700}renameWikiCategory\(root, store, ask\.from, ask\.to\)/.test(wikiPanel));

    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`test_wiki_category: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  CRASH ' + (e && e.stack || e)); process.exit(1); });
