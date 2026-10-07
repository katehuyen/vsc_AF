// X-55 (X-132) — THE SKILLS THAT SLEEP ON DISK, AND THE ONE PAGE THAT WAKES THEM.
//
// ‼️ WHAT THIS FILE IS THE PROOF OF. The whole idea rests on the library being
// FREE while it is not being used: fourteen skills in front of every model on
// every turn is a permanent bill and a procedure in front of work that does not
// need one. So nothing here loads a skill — the module reads the folder, and
// what it produces is ONE block of text: the library's own hook plus an index
// of where the skills actually are.
//
// And the failure this pins down is the quiet one: a hook without an index.
// The hook says "invoke the relevant skill" because it was written for a
// harness with a skill REGISTRY behind it. Here they are plain files, so a
// model given the hook alone would be told to invoke something it has no way
// to find — which reads as the feature working right up until it matters.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const S = require(path.join(ROOT, 'out', 'core', 'superpowers.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sp-'));
const root = path.join(tmp, 'superpowers');

const skill = (id, front, text) => {
    fs.mkdirSync(path.join(root, id), { recursive: true });
    fs.writeFileSync(path.join(root, id, 'SKILL.md'), front + text, 'utf8');
};
const FM = (name, desc) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n`;

skill('using-superpowers', FM('using-superpowers', 'Use when starting any conversation'),
    '## The Rule\n\nInvoke relevant skills BEFORE any response.\n');
skill('test-driven-development', FM('test-driven-development',
    'Use when writing any code - RED, GREEN, REFACTOR'), '# TDD\n\nWrite the test first.\n');
skill('systematic-debugging', FM('systematic-debugging',
    'Use when something is broken - find the root cause,\n    never patch the symptom'), '# Debugging\n');
fs.writeFileSync(path.join(root, 'systematic-debugging', 'root-cause-tracing.md'), '# tracing\n', 'utf8');
fs.writeFileSync(path.join(root, 'systematic-debugging', 'defense-in-depth.md'), '# depth\n', 'utf8');
// Not a skill: the library ships folders beside them, and a folder with no
// SKILL.md must be passed over in silence rather than listed as an empty one.
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets', 'logo.txt'), 'x', 'utf8');
fs.writeFileSync(path.join(root, 'README.md'), '# not a skill\n', 'utf8');

// ---------------------------------------------------------- reading them ----
{
    const list = S.readSkills(root);
    ok('every folder with a SKILL.md is a skill', list.length === 3);
    ok('…and a folder without one is not, in silence',
        !list.some(s => s.id === 'assets'));
    ok('they come back in reading order, by name',
        list.map(s => s.id).join(',') === 'systematic-debugging,test-driven-development,using-superpowers');
    const tdd = list.find(s => s.id === 'test-driven-development');
    ok('the one line saying WHEN it applies is read off the skill itself',
        /RED, GREEN, REFACTOR/.test(tdd.description));
    ok('…and the path is absolute, because that is what a reader has to open',
        path.isAbsolute(tdd.file) && fs.existsSync(tdd.file));
    const dbg = list.find(s => s.id === 'systematic-debugging');
    ok('a description written over two lines is one line again',
        dbg.description === 'Use when something is broken - find the root cause, never patch the symptom');
    ok('the other markdown in a skill\'s folder is counted, not lost',
        dbg.extras.length === 2 && dbg.extras[0] === 'defense-in-depth.md');
}

// ------------------------------------------------------------- the health ----
{
    const h = S.superpowersHealth(root, '%USERPROFILE%\\skills');
    ok('a folder with the hook and skills in it is usable', h.usable && h.exists && h.hookFound);
    ok('…and it reports the setting as TYPED beside the folder it opened',
        h.setting === '%USERPROFILE%\\skills' && h.root === root);
    ok('…with every skill and what it is for', h.skills.length === 3);

    const gone = S.superpowersHealth(path.join(tmp, 'nope'));
    ok('a folder that is not there is not usable, and says so',
        !gone.usable && !gone.exists && /not there/.test(gone.why));

    // ‼️ THE ONE ABSENCE THAT MATTERS. A folder full of skills with no hook in
    // it has nothing to put in front of a model — and reporting that as "0
    // skills" would send somebody looking for the wrong problem.
    const noHook = path.join(tmp, 'nohook');
    fs.mkdirSync(path.join(noHook, 'test-driven-development'), { recursive: true });
    fs.writeFileSync(path.join(noHook, 'test-driven-development', 'SKILL.md'),
        FM('test-driven-development', 'x') + '# TDD\n', 'utf8');
    const h2 = S.superpowersHealth(noHook);
    ok('a folder with skills but no hook is refused BY NAME',
        !h2.usable && h2.exists && h2.skills.length === 1
        && /using-superpowers[\\/]SKILL\.md is missing/.test(h2.why));
}

// -------------------------------------------------------------- the block ----
{
    const text = S.superpowersBlock(root);
    ok('the hook\'s own words are what a session is given',
        /Invoke relevant skills BEFORE any response/.test(text));
    ok('‼️ its frontmatter is NOT — registry metadata is noise to a model reading instructions',
        !/^---/m.test(text) && !text.includes('description: Use when starting'));
    ok('‼️ and the index is there, or "invoke the relevant skill" names nothing',
        /test-driven-development/.test(text) && /systematic-debugging/.test(text));
    ok('…each with the line saying when it applies', /RED, GREEN, REFACTOR/.test(text));
    ok('…and with the absolute path, which is the only way to read one',
        text.includes(path.join(root, 'test-driven-development', 'SKILL.md')));
    ok('…and it says they are files to READ, not a registry to invoke',
        /READ IT with your\s+file tool/.test(text));
    ok('the folder itself is named once, for a reader who wants to look around',
        text.includes('Root: `' + root + '`'));

    // ‼️ Half a hook is worse than none: a model told to use skills that are
    // not there goes looking, and every search is a turn spent on nothing.
    ok('a folder that cannot supply one supplies NOTHING, not a broken hook',
        S.superpowersBlock(path.join(tmp, 'nope')) === ''
        && S.superpowersBlock(path.join(tmp, 'nohook')) === '');

    // The cost is a standing one — it rides on every spawn of every session
    // that has the switch on — so it is capped like the project brief is.
    const big = path.join(tmp, 'big');
    fs.mkdirSync(path.join(big, 'using-superpowers'), { recursive: true });
    fs.writeFileSync(path.join(big, 'using-superpowers', 'SKILL.md'),
        FM('using-superpowers', 'x') + 'y'.repeat(S.SUPERPOWERS_HOOK_MAX + 500), 'utf8');
    const capped = S.superpowersBlock(big);
    ok('a hook that is not the library\'s own is cut rather than paid for for ever',
        capped.length < S.SUPERPOWERS_HOOK_MAX + 1200 && /cut at 8000 characters/.test(capped));
}

// --------------------------------------------------------------- the ops ----
(async () => {
    const bridge = new BridgeRegistry();
    S.registerSuperpowersOps(bridge, { root: () => root, rootSetting: () => '' });
    const names = (bridge.catalog().ops || bridge.catalog()).map(o => o.op || o);
    ok('both ops are in the catalogue',
        names.includes('superpowers.status') && names.includes('superpowers.hook'));

    const st = await bridge.dispatch('superpowers.status', {});
    ok('status answers what is on disk', st.ok && st.result.usable && st.result.skills.length === 3);

    const hk = await bridge.dispatch('superpowers.hook', {});
    ok('hook answers the exact text, and how much of it there is',
        hk.ok && hk.result.chars === hk.result.text.length && hk.result.chars > 100);
    ok('…and which skills it is indexing', hk.result.skills.length === 3);

    const b2 = new BridgeRegistry();
    S.registerSuperpowersOps(b2, { root: () => path.join(tmp, 'nohook') });
    const empty = await b2.dispatch('superpowers.hook', {});
    ok('‼️ an unusable folder answers an empty text AND the reason for it',
        empty.ok && empty.result.text === '' && /missing/.test(empty.result.why));

    // ============================================================ X-133 ======
    // THE SWITCH: who gets the discipline without asking, where the text goes,
    // and the two places it would silently stop being applied.
    console.log('\n-- X-133 · the switch');

    ok('an untouched install gives it to developer and to nobody else',
        S.superpowersDefaultFor('developer') && !S.superpowersDefaultFor('asistan')
        && !S.superpowersDefaultFor(''));
    ok('…matched on the NAME as a person types it, not on its case or padding',
        S.superpowersDefaultFor('  Developer ') === true);
    ok('‼️ an explicit false BEATS the built-in list, or the default could not be turned off',
        S.superpowersDefaultFor('developer', { developer: false }) === false);
    ok('…and a name the setting does not mention still falls back to the list',
        S.superpowersDefaultFor('developer', { asistan: true }) === true);

    // The op that writes it — the bridge half of item 5.
    let stored = { developer: true };
    const b3 = new BridgeRegistry();
    S.registerSuperpowersOps(b3, {
        root: () => root,
        defaults: () => stored,
        setDefault: (agent, on) => { stored = { ...stored, [agent]: on }; }
    });
    const names3 = (b3.catalog().ops || b3.catalog()).map(o => o.op || o);
    ok('superpowers.set is on the bridge', names3.includes('superpowers.set'));
    const set = await b3.dispatch('superpowers.set', { agent: 'psikolog', on: true });
    ok('…and it writes the agent\'s default', set.ok && stored.psikolog === true);
    const off = await b3.dispatch('superpowers.set', { agent: 'DEVELOPER', on: false });
    ok('‼️ …onto the row that is already there, whatever case it was typed in',
        off.ok && stored.developer === false && Object.keys(stored).length === 2);
    const noAgent = await b3.dispatch('superpowers.set', { on: true });
    ok('…and it refuses to guess which agent', !noAgent.ok);
    const st3 = await b3.dispatch('superpowers.status', {});
    ok('status prints the map, so the answer is readable before it is changed',
        st3.ok && st3.result.defaults.psikolog === true
        && st3.result.defaultAgents.includes('developer'));
    const readOnly = await bridge.dispatch('superpowers.set', { agent: 'x', on: true });
    ok('…and a host that supplies no writer refuses rather than pretending',
        !readOnly.ok);

    // ---- ONE FILE, TWO HALVES: the merge, and the names that keep it apart.
    const PC = require(path.join(ROOT, 'out', 'core', 'projectContext.js'));
    ok('‼️ a session with the switch ON does not overwrite the file of one with it OFF',
        PC.contextFileName('prj_a', 'session', true) !== PC.contextFileName('prj_a', 'session', false));
    ok('…and neither collides with the mission copy of either',
        new Set([
            PC.contextFileName('prj_a', 'session', true),
            PC.contextFileName('prj_a', 'session', false),
            PC.contextFileName('prj_a', 'mission', true),
            PC.contextFileName('prj_a', 'mission', false)
        ]).size === 4);
    ok('‼️ …and there is a name for NO PROJECT AT ALL, because the switch alone is a reason to append',
        PC.contextFileName('', 'session', true) === 'noproject-sp.txt');

    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ the two halves are joined in ONE place — --append-system-prompt-file takes one file',
        /const text = \[c\?\.text, hook\]\.filter\(t => !!t\)\.join\('\\n\\n'\);/.test(ext));
    ok('‼️ …and EITHER HALF ALONE is a file: no project is no longer no context',
        /if \(!c && !hook\) \{ return undefined; \}/.test(ext));
    ok('a task that is not a delegation runs to its own agent\'s default',
        /!task\.missionId && superpowersOnFor\(task\.agentName\)/.test(ext));
    // ‼️ K-34 — THE LINE GREW A SWITCH, AND THE INVARIANT IS UNCHANGED. A
    // terminal session still gets the discipline; what it gained is the ability
    // to be TOLD otherwise, which is the whole of K-34. `??` and not `||`, so a
    // deliberate `false` is not read as "said nothing".
    ok('‼️ a TERMINAL session gets it too, or an agent works one way in the panel and another in a terminal',
        /systemPromptFileFor\(projectId \|\| undefined, 'session',\s*\n\s*merged\.superpowers \?\? superpowersOnFor\(agent\.name\)\)/.test(ext));
    ok('‼️ …and a launcher, a tree row or a saved profile can now say otherwise',
        /superpowers\?: boolean;/.test(fs.readFileSync(path.join(ROOT, 'src', 'core', 'launch.ts'), 'utf8')));
    ok('‼️ …and a terminal RESUME is re-told, because the flag does not survive --resume',
        /projectContextFile: systemPromptFileFor\(own \|\| undefined, 'session',\s*\n\s*superpowersOnFor\(s\.agentName\), s\.sessionId\)/.test(ext));

    const host = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
    // ‼️ X-267 — still EVERY spawn, and on a resume it is the conversation's
    // pinned copy rather than a fresh composition of the same subject.
    ok('‼️ the hosted spawn carries it on EVERY spawn, on the one line that builds the command',
        /const ctxFile = this\.projectContextFile\(projectId, superpowers, init\.resume\);/.test(host)
        && /hostArgs\(\{ \.\.\.init, model: routedModel\(init\.model, routeRt\), permission, projectContextFile: ctxFile \}\)/.test(host));
    ok('‼️ …and a card retaking its own seat is asked what it was started with, before that record is dropped',
        /const seatSuperpowers = seat \? !!this\.sessions\.get\(seat\.id\)\?\.state\.superpowers : false;/.test(host)
        && host.indexOf('const seatSuperpowers') < host.indexOf('this.sessions.delete(seat.id)'));
    ok('…while an explicit answer from the caller still wins, so it can be turned OFF on a resume',
        /const superpowers = init\.superpowers \?\? seatSuperpowers;/.test(host));
    ok('‼️ an engine with no system-prompt channel gets the same text inside its first prompt',
        /context: init\.resume \? undefined : this\.readProjectContext\(projectId, superpowers\)/.test(host));

    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8');
    // S-102 — the transcript does not record the flag, but the session's own launch manifest does: that first, the agent's default after
    ok('‼️ a resume off the SHELF comes back as it was launched, else at the agent\'s default — the transcript does not record the flag',
        /host\.list\(\)\.some\(x => x\.sessionId === sessionId\)\s*\n\s*\? \{\}\s*\n\s*: \{ superpowers: asked\.superpowers \?\? this\.deps\.superpowersDefault\(row\.agentName \?\? ''\) \}/.test(panel));
    ok('…while a card the panel still holds answers for itself', /\? \{\}/.test(panel));
    ok('the next session starts from its own agent\'s answer, not the last one\'s',
        /this\.composerSuperpowers = undefined;/.test(panel));

    const page = fs.readFileSync(path.join(ROOT, 'media', 'console.js'), 'utf8');
    ok('‼️ the chip shows the TEXT, verbatim, exactly as the project chip does',
        /This is what goes in:\\n\\n' \+ text/.test(page));
    ok('‼️ an unusable folder is drawn as UNAVAILABLE, never as merely off',
        /pchip sw broken/.test(page) && /Superpowers unavailable/.test(page));
    ok('a running session wears its answer and cannot be re-switched under itself',
        /pchip sw fixed/.test(page) && /written once, at spawn/.test(page));
    // X-152 — the choice is one field of the host's record, asked through setIntent
    ok('‼️ pressing it back onto the agent\'s own answer CLEARS the choice',
        /askIntent\('superpowers', next === sp\.def \? null : next\)/.test(page));
    // ‼️ S-49 — the handler REPAINTS and does nothing else. That is enough for
    // the chip, and it is the whole point: `choice === ''` is resolved against
    // the agent the picker is showing, so an untouched chip follows the new
    // agent's own default without a value being written anywhere — while a chip
    // the user has pressed keeps their answer, exactly as the model, effort and
    // permission boxes beside it now do.
    // X-152 — the picker asks the host for the agent alone; the host's push
    // repaints the strip, and the chip resolves against the agent the record
    // now names (`agentNow()`).
    ok('…and the agent picker asks for the agent alone, and the strip follows the record',
        /byId\('c-agent', 'change', e => askIntent\('agentId', e\.target\.value, 'c-agent'\)\);/.test(page)
        && /const agent = \(DATA\.agents \|\| \[\]\)\.find\(a => a\.id === agentNow\(\)\);\s*\n\s*const def = !!\(agent && agent\.superpowers\);/.test(page));
    ok('‼️ S-49 — …and repaints WITHOUT reseeding the launch boxes under the user',
        !/seedFromAgent/.test(page));
    // X-152 — resolved on the HOST now, from the record's third answer: the
    // page sends content only, and the agent is the record's.
    ok('the answer start carries is the record\'s, resolved against the agent\'s own default',
        /superpowers: i\.superpowers \?\? this\.deps\.superpowersDefault\(agent\.name\),/
            .test(fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8'))
        && /vscode\.postMessage\(\{ type: 'start', text: value, attach: files \}\);/.test(page));

    // ------------------------------- X-136 · the cockpit, and the portable root
    //
    // ‼️ THE TWO FAILURES THIS HALF IS ABOUT ARE BOTH SILENT.
    //
    // 1. The empty setting fell through to ONE literal path — a folder that
    //    exists on exactly one computer. On any other machine the feature is
    //    on, the folder is not there, and a switched-on session is given
    //    nothing at all, which looks exactly like the switch being off.
    // 2. `superpowersDefaults` is keyed by an agent's NAME, and a JSON box
    //    cannot say which names exist. A misspelling is a default that never
    //    fires and never complains.
    {
        // The fallback resolves against the AGENTS, not against this machine.
        const nest = path.join(tmp, 'nest');
        const agentDir = path.join(nest, 'developer');
        fs.mkdirSync(agentDir, { recursive: true });
        const lib = path.join(nest, '_SKILLS', 'superpowers');
        fs.mkdirSync(path.join(lib, 'using-superpowers'), { recursive: true });
        fs.writeFileSync(path.join(lib, 'using-superpowers', 'SKILL.md'),
            FM('using-superpowers', 'Use when starting any conversation') + '# hook\n', 'utf8');

        ok('‼️ an empty setting resolves to _SKILLS/superpowers under the agent nest',
            S.superpowersFallbackRoot([nest]) === lib);
        ok('‼️ …and a root that names ONE agent finds the library BESIDE it, not under it',
            S.superpowersFallbackRoot([agentDir]) === lib);
        ok('the candidate that actually holds the hook wins over one that merely exists',
            S.superpowersFallbackRoot([path.join(tmp, 'nohook'), nest]) === lib);
        ok('…and with no hook anywhere, a folder that EXISTS is still named',
            S.superpowersFallbackRoot([path.join(tmp, 'nowhere')]).startsWith(path.join(tmp, 'nowhere')));
        ok('‼️ no roots at all is the one honest empty answer — there is nothing to resolve against',
            S.superpowersFallbackRoot([]) === '' && S.superpowersFallbackRoot(['', '  ']) === '');
        ok('a root repeated, or two roots sharing a parent, is looked at once',
            S.superpowersFallbackRoot([nest, nest, agentDir]) === lib);
        ok('‼️ and the literal machine path is gone from the fallback',
            !/'_SKILLS', 'superpowers'/.test(ext));
        ok('…the extension expands the roots before handing them over, because expansion needs the workspace',
            /superpowersFallbackRoot\(\s*\n\s*cfg\(\)\.get<string\[\]>\('agentRoots', \[\]\)/.test(ext));

        // One rule for writing the map, shared rather than copied — two writers
        // of one setting is exactly how a second row for one agent appears.
        const store = { Developer: true, asistan: false };
        ok('‼️ a differently-spelled name writes onto the row that is already there',
            S.superpowersDefaultsKey('developer', store) === 'Developer'
            && S.superpowersDefaultsKey('DEVELOPER', store) === 'Developer');
        ok('…and a name nobody has written yet gets a row of its own',
            S.superpowersDefaultsKey('psikolog', store) === 'psikolog');
        ok('…which is what superpowersDefaultFor reads back, so the two cannot disagree',
            S.superpowersDefaultFor('DEVELOPER', store) === true
            && S.superpowersDefaultFor('Asistan', store) === false);

        const set = require('./lib_settings_source').settingsPageSource();
        ok('the section is drawn for its own category, as the wiki one is',
            /c\.id === 'superpowers' \? superpowersSection\(c\)/.test(set));
        ok('‼️ the page says the one thing a text box cannot: without the hook a session gets NOTHING',
            /given nothing at all from here/.test(set));
        ok('the hook is drawn as a checklist row, found or not',
            /using-superpowers\/SKILL\.md/.test(set) && /sp\.hookFound \? '✓' : '✗'/.test(set));
        ok('‼️ every discovered agent gets a box — the setting is keyed by a NAME',
            /data-spagent="\$\{C\.esc\(a\.name\)\}"/.test(set));
        ok('…and a row nobody wrote down is drawn as a DEFAULT, not as a choice',
            /a\.explicit \? '' : ' spdef'/.test(set) && /' · default'/.test(set));
        ok('all three gestures are wired',
            ['spDefault', 'spRescan', 'spReveal'].every(g => set.includes(`'${g}'`)));
        ok('…and the reset is the ordinary one, so it cannot drift from the schema default',
            /data-reset="agentFarm\.superpowersPath"/.test(set));

        const sp = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'settingsPanel.ts'), 'utf8');
        ok('the host reads the folder on every draw — it is edited by hand while the page is open',
            /superpowers: this\.deps\.superpowers\?\.\(\) \?\? null/.test(sp));
        ok('‼️ the box writes through the SHARED key rule, not its own',
            /superpowersDefaultsKey\(agent, store\)/.test(ext));

        const ops = fs.readFileSync(path.join(ROOT, 'src', 'core', 'settingsops.js').replace('.js', '.ts'), 'utf8');
        ok('both settings are filed under the section that can answer for them',
            /superpowersPath: 'superpowers'/.test(ops) && /superpowersDefaults: 'superpowers'/.test(ops));

        const par = JSON.parse(fs.readFileSync(path.join(ROOT, 'parity.manifest.json'), 'utf8'));
        const row = par.entries.find(e => e.capability === 'settingsPanel.ts#spDefault');
        ok('the box that writes a setting is bound to its op, not exempted',
            !!row && (row.ops || []).includes('superpowers.set'));
    }

    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
    console.log(`\ntest_superpowers: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
