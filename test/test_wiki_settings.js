// X-57 — SETTINGS ▸ WIKI & KNOWLEDGE BASE: A PORTABLE ROOT, AND A FOLDER THAT
// SAYS WHETHER IT IS A WIKI.
//
// ‼️ THE BUG THIS FILE IS ABOUT IS AN INVISIBLE ONE. `wiki.compile` refuses
// without `_KURALLAR_/-WIKI-ANAYASA-.md` — the vault's own law outranks the
// agent procedure, so a compile that could not find it would be a guess. But
// the root was one text box, and a perfectly spelled path to a folder that has
// never held that file looks exactly like a working configuration. Every
// assertion here is a version of "the page could have said so".
//
// The second half is portability: the setting travels with `settings.json`
// between machines, so a literal `C:\Users\<name>\…` is a wiki that exists on
// one computer. What the user typed is kept; only what the code OPENS is
// expanded — and an unknown variable is LEFT ALONE rather than blanked, because
// `${nope}/wiki` collapsing to `/wiki` would quietly name the drive root.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));
const P = require(path.join(ROOT, 'out', 'core', 'portablePaths.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wikiset-'));

// ---------------------------------------------------- 1. the portable path

{
    const env = { USERPROFILE: 'C:\\Users\\murat', HOME: '/home/murat', ZONE: 'D:\\zone' };
    const ctx = { env, home: 'C:\\Users\\murat', workspaceRoot: 'D:\\repo' };
    const x = s => P.expandUserPath(s, ctx);

    ok('%USERPROFILE% is the home', x('%USERPROFILE%\\vault\\00_WIKI') === 'C:\\Users\\murat\\vault\\00_WIKI');
    ok('…and it does not care about the case Windows does not care about',
        x('%userprofile%\\wiki') === 'C:\\Users\\murat\\wiki');
    ok('~ at the start is the home', x('~/vault/00_WIKI') === 'C:\\Users\\murat/vault/00_WIKI');
    ok('~ alone is the home', x('~') === 'C:\\Users\\murat');
    ok('‼️ but ~ inside a name is a real folder on a real disk',
        x('C:\\PROGRA~1\\wiki') === 'C:\\PROGRA~1\\wiki');
    ok('${env:VAR} — VS Code\'s own grammar', x('${env:ZONE}\\know\\00_WIKI') === 'D:\\zone\\know\\00_WIKI');
    ok('$HOME, for whoever types it that way', x('$HOME/wiki') === 'C:\\Users\\murat/wiki');
    ok('${workspaceRoot} is the open project', x('${workspaceRoot}/docs/wiki') === 'D:\\repo/docs/wiki');
    ok('‼️ an unknown variable is LEFT ALONE, never blanked into a drive root',
        x('${nope}/wiki') === '${nope}/wiki' && x('%NOPE%\\wiki') === '%NOPE%\\wiki');
    ok('an ordinary absolute path is untouched',
        x('D:\\zone\\know\\note\\obsidian\\00_WIKI') === 'D:\\zone\\know\\note\\obsidian\\00_WIKI');
    ok('empty stays empty', P.expandUserPath('', ctx) === '' && P.expandUserPath(undefined, ctx) === '');
}

// -------------------------------------------- 2. health: is it a wiki yet?

const root = path.join(tmp, 'vault', '00_WIKI');

{
    const h0 = W.wikiHealth(root, '%USERPROFILE%\\vault\\00_WIKI');
    ok('a folder that is not there says so', h0.exists === false);
    ok('…and is not compilable', h0.compilable === false);
    ok('…and all three files are reported missing', h0.missing.length === 3);
    ok('the setting is carried through as TYPED, beside the resolved path',
        h0.setting === '%USERPROFILE%\\vault\\00_WIKI' && h0.root === root);
    ok('the three files are named in the order a reader fixes them',
        h0.files.map(f => f.rel).join(' ') === '_KURALLAR_/-WIKI-ANAYASA-.md index.md log.md');
}

// -------------------------------------------------- 3. the scaffold writes

{
    const r = W.scaffoldWiki(root);
    // X-138 - the count is no longer three: a scaffold also makes the `_RAW_`
    // drop box and its `_DONE_` archive. Named rather than counted, so the next
    // thing a wiki grows does not fail a check about the starter FILES.
    ok('the scaffold creates the root and all three files',
        r.ok && r.existed.length === 0
        && ['_KURALLAR_/-WIKI-ANAYASA-.md', 'index.md', 'log.md']
            .every(f => r.created.includes(f)));
    ok('…and the drop box, which is part of the shape of a wiki',
        r.created.includes('_RAW_') && r.created.includes('_RAW_/_DONE_'));
    ok('…the law is really on disk',
        fs.existsSync(path.join(root, '_KURALLAR_', '-WIKI-ANAYASA-.md')));

    const law = fs.readFileSync(path.join(root, '_KURALLAR_', '-WIKI-ANAYASA-.md'), 'utf8');
    ok('‼️ the law says out loud that it is a starter and is never rewritten',
        /never write it again/i.test(law) && /Rewrite every line/i.test(law));
    ok('…and that it outranks the agent procedure', /outranks the agent procedure/i.test(law));
    ok('the single-level rule is in it, with the spelling of a family',
        /single level/i.test(law) && /Teknoloji - Tarım/.test(law));
    // The one Turkish word in it is a category NAME quoted as an example of the
    // single-level spelling — it is the user's own content, not the scaffold's
    // language (feedback_agentfarm_dil_kurali).
    ok('a generated scaffold is English', !/[çğışöüÇĞİŞÖÜ]/.test(law.replace(/Tarım/g, '')));

    const h = W.wikiHealth(root);
    ok('and now it is compilable', h.exists && h.compilable && h.missing.length === 0);
}

// --------------------------------------- 4. running it twice writes nothing

{
    const file = path.join(root, '_KURALLAR_', '-WIKI-ANAYASA-.md');
    fs.writeFileSync(file, '# MY OWN LAW\n\nnothing of theirs.\n', 'utf8');
    const again = W.scaffoldWiki(root);
    ok('a second run creates nothing and reports what was there',
        again.ok && again.created.length === 0 && again.existed.length === 3);
    ok('‼️ AND THE USER\'S OWN LAW IS EXACTLY AS THEY LEFT IT',
        fs.readFileSync(file, 'utf8') === '# MY OWN LAW\n\nnothing of theirs.\n');
}

// ------------------------------------------- 5. what the section then reads

{
    fs.mkdirSync(path.join(root, 'Ajanlar'), { recursive: true });
    fs.mkdirSync(path.join(root, 'Teknoloji - Tarım'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Ajanlar', 'Notices.md'), '# Notices\n', 'utf8');
    const h = W.wikiHealth(root);
    ok('an empty folder is a category too (U-91), and the page count says which is which',
        h.categories.length === 2
        && h.categories.find(c => c.name === 'Ajanlar').pages === 1
        && h.categories.find(c => c.name === 'Teknoloji - Tarım').pages === 0);
    ok('the page count is the wiki\'s, not the folder list\'s', h.pages === 1);

    fs.mkdirSync(path.join(root, 'Ajanlar', 'Alt'), { recursive: true });
    ok('a second level is REPORTED rather than counted',
        W.wikiHealth(root).misplaced.length === 1);
}

// ----------------------------------------------------- 6. the two new ops

async function bridgeOps() {
    const bridge = new BridgeRegistry();
    const store = new W.WikiStore(path.join(tmp, 'pool.json'));
    const fresh = path.join(tmp, 'second', '00_WIKI');
    W.registerWikiOps(bridge, {
        store: () => store,
        root: () => fresh,
        rootSetting: () => '${env:NOPE}\\00_WIKI',
        sessions: () => []
    });
    const ops = bridge.catalog().map(o => o.op);
    ok('wiki.health and wiki.init are on the bridge',
        ops.includes('wiki.health') && ops.includes('wiki.init'));

    const before = await bridge.dispatch('wiki.health', {});
    ok('wiki.health reports the empty folder', before.ok && before.result.exists === false);
    ok('…and hands back the setting as typed, so an unresolved variable is visible',
        before.result.setting === '${env:NOPE}\\00_WIKI');

    const made = await bridge.dispatch('wiki.init', {});
    ok('wiki.init makes it a wiki', made.ok
        && ['_KURALLAR_/-WIKI-ANAYASA-.md', 'index.md', 'log.md']
            .every(f => made.result.created.includes(f)));
    ok('…and the drop box comes with it (X-138)',
        made.result.health.raw.ready === true);
    ok('…and answers with the health it just achieved, not with a promise',
        made.result.health.compilable === true);

    const twice = await bridge.dispatch('wiki.init', {});
    ok('wiki.init is idempotent', twice.ok && twice.result.created.length === 0);
}

// ------------------------------- 7. the compile defaults, and where they are

{
    const so = fs.readFileSync(path.join(ROOT, 'src', 'core', 'settingsops.ts'), 'utf8');
    ok('the wiki has its own settings section, and every wiki key is in it',
        /\['wiki', 'Wiki & Knowledge Base'\]/.test(so)
        && /wikiRoot: 'wiki'/.test(so) && /wikiEngine: 'wiki'/.test(so)
        && /wikiModel: 'wiki'/.test(so) && /wikiEffort: 'wiki'/.test(so));

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties;
    ok('the root earns a folder picker rather than a hand-typed path',
        props['agentFarm.wikiRoot']['x-af-browse'] === 'folder');
    ok('…and its description says the portable spellings out loud',
        /%USERPROFILE%/.test(props['agentFarm.wikiRoot'].description)
        && /\$\{workspaceRoot\}/.test(props['agentFarm.wikiRoot'].description));
    ok('engine, model and effort are settings, so every door starts the same run',
        !!props['agentFarm.wikiEngine'] && !!props['agentFarm.wikiModel']
        && !!props['agentFarm.wikiEffort']);
    ok('the engine list is the engines there ARE, not a list typed once',
        ['claude', 'codex', 'gemini', 'agy', 'opencode']
            .every(e => props['agentFarm.wikiEngine'].enum.includes(e)));

    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ the root is EXPANDED where it is opened, never written back to the setting',
        /expandUserPath\(set, \{ workspaceRoot: ws \}\)/.test(ext));
    ok('the three defaults reach the compile',
        /defaultEngine: \(\) => cfg\(\)\.get<string>\('wikiEngine'\)/.test(ext)
        && /defaultModel: \(\) => cfg\(\)\.get<string>\('wikiModel'\)/.test(ext)
        && /defaultEffort: \(\) => cfg\(\)\.get<string>\('wikiEffort'\)/.test(ext));

    const wiki = fs.readFileSync(path.join(ROOT, 'src', 'core', 'wiki.ts'), 'utf8');
    ok('…and a named argument still outranks the setting',
        /optStr\(args, 'engine'\) \|\| \(deps\.defaultEngine/.test(wiki));

    const page = fs.readFileSync(path.join(ROOT, 'media', 'settings.js'), 'utf8');
    ok('the section is drawn for the wiki category, like prompts before it',
        /c\.id === 'wiki' \? wikiSection\(c\)/.test(page));
    ok('‼️ the page says the one thing a text box cannot: a compile refuses without the law',
        /every compile refuses without it/.test(page));
    ok('all four gestures are wired',
        ['wikiInit', 'wikiRescan', 'wikiReveal', 'wikiOpen'].every(g => page.includes(`'${g}'`)));

    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'settingsPanel.ts'), 'utf8');
    ok('the host reads the folder on every draw — it is edited in Obsidian while the page is open',
        /wiki: this\.deps\.wikiHealth\?\.\(\) \?\? null/.test(panel));

    const par = JSON.parse(fs.readFileSync(path.join(ROOT, 'parity.manifest.json'), 'utf8'));
    const row = par.entries.find(e => e.capability === 'settingsPanel.ts#wikiInit');
    ok('the button that writes files is bound to its op, not exempted',
        !!row && (row.ops || []).includes('wiki.init'));
}

bridgeOps().then(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
    console.log(`test_wiki_settings: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
});
