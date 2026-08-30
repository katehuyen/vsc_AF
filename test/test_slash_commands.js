// K-29 — THE SLASH COMMAND CATALOG: three sources, one precedence, no disk read.
//
// ‼️ WHY THE SHIPPED TABLE IS NOT THE ANSWER, MEASURED. A real Claude
// `system:init` on this machine named 47 slash commands, and the list mixed the
// CLI's own (`/model`, `/compact`, `/context`) with the SKILLS this machine
// happens to have installed (`/dataviz`, `/account-signup`) and two internal
// names nobody types (`__remote-workflow`, `workflow-launch-exec`). So the
// catalog is not a table this build keeps up to date; it is a merge, and the
// table is only what fills the gap before any session exists to be asked.
//
// THE RULE BEING PINNED: disk beats the session's report beats the shipped
// table, one way, always — because a file is the only source with a description
// somebody wrote on purpose.

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(`${n} (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const S = require(path.join(ROOT, 'out', 'core', 'slashCommands.js'));
const T = require(path.join(ROOT, 'out', 'core', 'toolbox.js'));

const nameOf = list => list.map(c => c.name);
const find = (list, n) => list.find(c => c.name === n);

// ---------- K-31: every shipped row can be READ, and says what it takes ----
//
// ‼️ THE PICKER DRAWS THIS TABLE VERBATIM. A row with no sentence is a row the
// user has to try in order to find out what it does, and a `/model name` with
// no bracket cannot be told apart from a command called "name" — so the shape
// of the hint is part of the table, not a matter of taste. Swept rather than
// spot-checked: the failure this catches is a SIXTH engine added in a hurry.
{
    const bad = [];
    for (const engine of Object.keys(S.BUILTIN_SLASH)) {
        const seen = new Set();
        for (const c of S.BUILTIN_SLASH[engine]) {
            const at = `${engine} ${c.name}`;
            if (!/^\/[a-z][\w:-]*$/.test(c.name)) { bad.push(at + ' — name'); }
            if (seen.has(c.name)) { bad.push(at + ' — said twice'); }
            seen.add(c.name);
            if (!c.description || c.description.length < 12) { bad.push(at + ' — description'); }
            if (!/[.!?]$/.test(c.description || '')) { bad.push(at + ' — no full stop'); }
            // `<required>` or `[optional]`, and nothing else: the picker prints
            // it beside the name, so the brackets ARE the explanation.
            if (c.args && !/^(<[^<>]+>|\[[^[\]]+\])$/.test(c.args)) { bad.push(at + ' — args'); }
            if (c.engine !== engine) { bad.push(at + ' — filed under the wrong engine'); }
            if (c.scope !== 'engine') { bad.push(at + ' — the shipped table is the ENGINE\'s own'); }
        }
    }
    eq('‼️ every shipped command has a name, a sentence and a legal argument hint', bad, []);

    // ‼️ AND THE TUI FLAG IS NOT DECORATION — K-31 draws a warning off it, so a
    // table where nothing carries it would ship a picker whose warning can
    // never appear. Claude's own `/model`, `/config` and `/agents` are the
    // measured cases.
    const tui = Object.keys(S.BUILTIN_SLASH)
        .flatMap(e => S.BUILTIN_SLASH[e]).filter(c => c.tui);
    ok(`the interactive ones are marked, so the picker can say so (${tui.length})`,
        tui.length >= 5 && tui.some(c => c.name === '/model'));
}

// ---------- the shipped table, per engine ----------
{
    const claude = S.getSlashCommands({ engine: 'claude' });
    ok('an engine with a table gets it', claude.length > 0);
    ok('…and every row of it is that engine\'s own',
        claude.every(c => c.scope === 'engine' && c.engine === 'claude'));
    ok('…named with the slash the user actually types',
        claude.every(c => c.name.startsWith('/')));
    ok('…and sorted, so the picker\'s order is a property of the answer',
        nameOf(claude).join() === nameOf(claude).slice().sort().join());

    // ‼️ THE ENGINES ARE DIFFERENT PROGRAMS AND THE LISTS SAY SO. Antigravity's
    // workflow verbs are not Claude's, and offering one engine's commands on
    // another is offering a way to break the session.
    const agy = S.getSlashCommands({ engine: 'agy' });
    ok('Antigravity answers with its own vocabulary',
        !!find(agy, '/goal') && !!find(agy, '/plan') && !!find(agy, '/browser'));
    ok('…and not with Claude\'s', !find(agy, '/compact') && !find(agy, '/context'));
    ok('every engine row is tagged with the engine it belongs to',
        agy.every(c => c.engine === 'agy'));
    const oc = S.getSlashCommands({ engine: 'opencode' });
    ok('OpenCode answers with its own too',
        !!find(oc, '/models') && !find(oc, '/model'));
    eq('gemini rows are gemini\'s, not silently claude\'s',
        [...new Set(S.getSlashCommands({ engine: 'gemini' }).map(c => c.engine))], ['gemini']);
    // An engine this build has not measured is not a bug: it gets the disk and
    // whatever it reports, which is the honest answer.
    eq('an engine with no table answers empty rather than guessing',
        S.getSlashCommands({ engine: 'nosuch' }), []);
    eq('…and no engine at all means claude, which is what every older surface meant',
        nameOf(S.getSlashCommands({})).join(), nameOf(claude).join());

    // ‼️ K-31 will warn about these, and it is a property of the COMMAND rather
    // than a list of names the picker keeps in step.
    ok('a command whose job is an interactive menu is marked as one',
        find(claude, '/model').tui === true && find(claude, '/config').tui === true);
    ok('…and one that just answers is not', !find(claude, '/context').tui);
    ok('a command that takes something says what', find(claude, '/model').args === '[name]');
    ok('…and one that takes nothing says nothing', find(claude, '/context').args === '');
}

// ---------- what the SESSION reported ----------
{
    // The real shape: the CLI sends bare names, no slash.
    const reported = ['model', 'compact', 'dataviz', 'account-signup', '__remote-workflow'];
    const list = S.getSlashCommands({ engine: 'claude', sources: { reported } });
    ok('‼️ a reported name the shipped table never had is ADDED',
        !!find(list, '/dataviz') && !!find(list, '/account-signup'));
    ok('…with the slash put back on, because that is what gets typed',
        find(list, '/dataviz').name === '/dataviz');
    ok('…and marked as coming from the running process, not from this build',
        find(list, '/dataviz').reported === true);
    ok('a name the table already had keeps the description we wrote',
        find(list, '/model').description.length > 0 && find(list, '/model').reported === true);
    // ‼️ AN INTERNAL NAME IS NOT A COMMAND. Both of these were in the measured
    // list; offering them is offering a way to break the session.
    ok('‼️ an internal name is dropped rather than offered',
        !list.some(c => c.name.startsWith('/_')));
    // ‼️ K-35 — AND A REPORT IS A COMPLETE ANSWER, NOT AN ADDITION.
    //
    // This used to assert the opposite: a shipped row the session never named
    // stayed on the list. Measured against a real Claude (49 names), `/cost` is
    // in the shipped table and is NOT among them — so the old rule offered a
    // command whose only possible answer is "unknown", while the picker's whole
    // claim is that it lists what this session can run. A process that has
    // named its commands has named all of them.
    ok('‼️ a table entry the session did NOT name is dropped, not offered',
        !find(list, '/clear') && !find(list, '/context'));
    ok('…and the ones it DID name are all there',
        !!find(list, '/model') && !!find(list, '/compact'));
    // …but only once somebody has ASKED. With no report the table is all there
    // is, and that is the moment it exists for.
    ok('a catalog with nothing reported is still the shipped table',
        S.getSlashCommands({ engine: 'claude' }).some(c => c.name === '/clear'));
    ok('‼️ an internal name the CLI reports anyway is not offered either',
        !find(list, '/workflow-launch-exec')
        && !S.getSlashCommands({ engine: 'claude', sources: { reported: ['workflow-launch-exec'] } })
            .some(c => c.name === '/workflow-launch-exec'));

    // ---- K-35: the same init says WHICH are skills, and which need a terminal
    //
    // ‼️ MEASURED, NOT DECIDED HERE. `system:init` carries `skills` (17 of the
    // 49 names on this machine) and `terminal_slash_commands` (`doctor`,
    // `color`). Filing a skill as the engine's own printed a claim about a
    // MACHINE as a claim about a PROGRAM, and the hand-marked `tui` flags were
    // a guess sitting next to the CLI's own answer about the same question.
    const rich = S.getSlashCommands({
        engine: 'claude',
        sources: {
            reported: ['model', 'dataviz', 'doctor', 'color', 'compact'],
            reportedSkills: ['dataviz'],
            reportedTerminalOnly: ['doctor', 'color']
        }
    });
    ok('a reported SKILL is filed as one, not as the engine\'s own',
        find(rich, '/dataviz').scope === 'skill' && find(rich, '/dataviz').engine === '');
    ok('…and a reported command is still the engine\'s',
        find(rich, '/model').scope === 'engine' && find(rich, '/model').engine === 'claude');
    ok('‼️ the CLI\'s own terminal-only list wins over the shipped guess',
        find(rich, '/color').tui === true && !find(rich, '/model').tui);
    ok('…and a report that says nothing about it leaves the guess alone',
        find(list, '/model').tui === true);
}

// ---------- K-35: the report, remembered ----------
//
// ‼️ THE COMPOSER'S `/` IS PRESSED BEFORE A SESSION EXISTS — which is exactly
// when the only authoritative source is not there to ask. The picker offered 18
// shipped rows where the same machine's terminal offers 49, and no table can
// close that: two thirds of the list is skills and plugins, i.e. facts about
// THIS install. So the answer a process gave once is kept.
{
    const r = { names: ['model', 'dataviz'], skills: ['dataviz'], terminalOnly: ['doctor'], at: 5 };
    const store = S.rememberSlashReport({}, 'claude', 'a1', r);
    ok('a report is written under the agent AND under the engine',
        !!store['claude|a1'] && !!store.claude);
    ok('the agent that owns it reads its own', S.recallSlashReport(store, 'claude', 'a1') === r);
    ok('…an agent that has never run reads the engine\'s',
        S.recallSlashReport(store, 'claude', 'other') === r);
    ok('…and an engine nobody has run answers nothing',
        S.recallSlashReport(store, 'codex') === undefined);
    // ‼️ An older CLI that names nothing must not erase what a newer one proved.
    eq('an empty report changes nothing',
        S.rememberSlashReport(store, 'claude', 'a1', { names: [], at: 9 }), store);
    eq('a remembered report reaches the merge in one piece',
        S.reportToSources(r),
        {
            reported: ['model', 'dataviz'], reportedSkills: ['dataviz'],
            reportedTerminalOnly: ['doctor']
        });
    eq('…and nothing remembered is nothing to merge', S.reportToSources(undefined), {});
    const back = S.getSlashCommands({ engine: 'claude', sources: S.reportToSources(r) });
    eq('so a composer with nothing running answers with the install\'s own list',
        nameOf(back), ['/dataviz', '/model']);
    ok('…skills included, badged as what they are', find(back, '/dataviz').scope === 'skill');
}

// ---------- the disk, and folder namespacing ----------
{
    const sources = {
        commands: [
            { name: '/git:cleanup', description: 'Prune merged branches', source: 'C:/x/git/cleanup.md', argumentHint: '[branch]' },
            { name: '/review', description: 'Our own review recipe', source: 'C:/x/review.md' }
        ],
        skills: [{ name: 'account-signup', description: 'Sign one account up', source: 'C:/s/SKILL.md' }],
        workflows: [{ name: '/deploy', description: 'Ship it', source: 'C:/w/deploy.md' }],
        reported: ['review', 'account-signup']
    };
    const list = S.getSlashCommands({ engine: 'claude', sources });
    // ‼️ THE FOLDER IS THE NAMESPACE — this is the whole reason a commands tree
    // is worth having, and the picker must show the full address.
    ok('‼️ a command in a subfolder keeps its folder in its name',
        !!find(list, '/git:cleanup'));
    ok('…and carries the argument hint the file declared',
        find(list, '/git:cleanup').args === '[branch]');
    ok('…and the file it came from, so the picker can open it',
        find(list, '/git:cleanup').source === 'C:/x/git/cleanup.md');
    eq('each disk row says which kind of file it is',
        [find(list, '/git:cleanup').scope, find(list, '/deploy').scope,
            find(list, '/account-signup').scope],
        ['local', 'workflow', 'skill']);
    ok('a disk command belongs to no engine — any of them can run it',
        find(list, '/git:cleanup').engine === '');
    // ‼️ PRECEDENCE. `/review` is BOTH reported and on disk; the file wins,
    // because the file is where a description was written on purpose.
    ok('‼️ a file beats the session\'s bare name',
        find(list, '/review').scope === 'local'
        && find(list, '/review').description === 'Our own review recipe');
    ok('…and the row still says the session knows about it',
        find(list, '/review').reported === true);
}

// ---------- narrowing, which is what the box types into ----------
{
    const list = S.getSlashCommands({
        engine: 'claude',
        sources: { commands: [{ name: '/git:cleanup', description: 'Prune merged branches', source: 'x' }] }
    });
    eq('typing the folder finds the command inside it',
        nameOf(S.narrowSlash(list, 'git')), ['/git:cleanup']);
    ok('a leading slash is optional',
        S.narrowSlash(list, '/git').length === S.narrowSlash(list, 'git').length);
    ok('the description is searched too, or half the catalog is unfindable',
        nameOf(S.narrowSlash(list, 'merged')).join() === '/git:cleanup');
    eq('nothing typed narrows nothing', S.narrowSlash(list, '   ').length, list.length);
    eq('a miss is an empty list, not everything', S.narrowSlash(list, 'zzzz'), []);
    ok('the same filter is reachable through the query, for one-shot callers',
        S.getSlashCommands({ engine: 'claude', q: 'git', sources: {
            commands: [{ name: '/git:cleanup', description: 'x', source: 'y' }] } }).length === 1);
}

// ---------- ‼️ merging what a session reports, twice ----------
//
// `system:init` arrives once per process — but a resume sends another, and
// /reload-skills sends another. A list that SHRANK because the second report
// was shorter would take commands away from a picker that had them a moment ago.
{
    eq('the first report is taken whole', S.mergeReported(undefined, ['a', 'b']), ['a', 'b']);
    eq('‼️ a second report ADDS rather than replaces', S.mergeReported(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
    eq('an empty second report changes nothing', S.mergeReported(['a'], []), ['a']);
    eq('…and so does a missing one', S.mergeReported(['a'], undefined), ['a']);
    eq('a non-array is not a report', S.mergeReported(['a'], 'nope'), ['a']);
    eq('nothing at all is an empty list, never undefined', S.mergeReported(undefined, undefined), []);
    ok('the engine\'s own order is preserved',
        S.mergeReported([], ['z', 'a', 'm']).join() === 'z,a,m');
}

// ---------- K-30 groundwork: when is the box actually ASKING? ----------
//
// "Typed a slash" is not "the text contains a slash", and every case below is
// one a naive startsWith('/') gets wrong — a picker that opens on a pasted URL
// is a picker people learn to dismiss rather than to use.
{
    const at = (t, c) => S.slashQueryAt(t, c === undefined ? t.length : c);
    eq('a bare slash is a query with nothing typed yet', at('/'), { start: 0, q: '' });
    eq('…and what follows it is the query', at('/mod'), { start: 0, q: 'mod' });
    eq('a slash after a space starts one too', at('please /com'), { start: 7, q: 'com' });
    eq('…and after a newline', at('line one\n/com'), { start: 9, q: 'com' });
    ok('nothing typed at all is not a query', !at(''));
    ok('plain text is not a query', !at('hello there'));
    // ‼️ NOT A COMMAND: a URL, a path and a fraction all contain a slash and
    // none of them is somebody reaching for the picker.
    ok('‼️ a URL is not a command', !at('see http://x.dev/page'));
    ok('‼️ a path is not a command', !at('open src/core/launch.ts'));
    ok('‼️ and neither is a fraction', !at('and/or'));
    // ‼️ A SPACE ENDS THE NAME. What follows is the command's argument and the
    // picker has nothing left to narrow.
    ok('‼️ once the name is complete the query is over', !at('/model opus'));
    // ‼️ ONLY UNDER THE CARET. A command on line one is not a live query while
    // a paragraph is being typed on line four.
    ok('a slash the caret has moved away from is not a live query',
        !at('/model\nnow some prose', 'model\nnow some prose'.length + 1));
    eq('…while the caret still inside it is', at('/model', 4), { start: 0, q: 'mod' });
    eq('a caret past the end is clamped rather than throwing', at('/mod', 999), { start: 0, q: 'mod' });
    eq('…and a negative one too', at('/mod', -5), undefined);
    // The start is what an accepted command replaces from — the answer is
    // useless without it.
    eq('the query says where to replace from', at('type /gi').start, 5);
}

// ---------- the disk half is the TOOLBOX's reader, not a second one ----------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-slash-'));
    const mk = (p, body) => {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, body, 'utf8');
    };
    mk(path.join(tmp, '.claude', 'commands', 'git', 'cleanup.md'),
        '---\ndescription: Prune merged branches\nargument-hint: "[branch]"\n---\nbody');
    mk(path.join(tmp, '.claude', 'skills', 'mine', 'SKILL.md'),
        '---\nname: mine\ndescription: my own\n---\nbody');
    mk(path.join(tmp, '.agents', 'workflows', 'deploy.md'), '---\ndescription: ship it\n---\nbody');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'af-home-'));

    const found = T.scanSlashSources(tmp, home);
    ok('the agent\'s own commands folder is read',
        found.commands.some(c => c.name === '/git:cleanup' && c.argumentHint === '[branch]'));
    ok('…its skills too', found.skills.some(s => s.name === 'mine'));
    // ‼️ Antigravity's workflows are OUTSIDE .claude — they are that engine's
    // files, and they are namespaced by the same scanner so the picker does not
    // learn two naming rules.
    ok('…and the engine workflows beside them, not inside .claude',
        found.workflows.some(w => w.name === '/deploy'));
    ok('no agent means no agent-scope folders and no crash',
        T.scanSlashSources(undefined, home).workflows.length === 0);

    // And the whole thing end to end, through the same function the op calls.
    const list = S.getSlashCommands({ engine: 'claude', sources: found });
    ok('the catalog carries all three kinds at once',
        !!find(list, '/git:cleanup') && !!find(list, '/mine') && !!find(list, '/deploy'));
    ok('…on top of the engine\'s own', !!find(list, '/compact'));

    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
}

// ---------- the session state carries what the process said ----------
{
    const P = require(path.join(ROOT, 'out', 'core', 'consoleproto.js'));
    const base = { id: 'h1', agentId: 'a', agentName: 'dev', cwd: 'C:/x', status: 'starting', messages: [] };
    const init = {
        type: 'system', subtype: 'init', session_id: 'sid-1',
        slash_commands: ['model', 'compact', 'dataviz']
    };
    const r1 = P.reduceEvent(base, init, Date.now());
    eq('‼️ system:init puts the reported commands on the SESSION',
        r1.state.slashCommands, ['model', 'compact', 'dataviz']);
    // A resume sends a second init. The picker must not lose what it had.
    const r2 = P.reduceEvent(r1.state,
        { ...init, slash_commands: ['compact', 'newthing'] }, Date.now());
    eq('…and a second init adds to it rather than replacing it',
        r2.state.slashCommands, ['model', 'compact', 'dataviz', 'newthing']);
    const r3 = P.reduceEvent(r2.state, { type: 'system', subtype: 'init' }, Date.now());
    eq('an init that names none takes none away',
        r3.state.slashCommands, ['model', 'compact', 'dataviz', 'newthing']);
}

// ---------- K-32: the picker's answer IS the op's answer ------------------
//
// ‼️ THE PARITY THAT MATTERS IS NOT "BOTH EXIST". `parity.manifest.json` says
// the Console's `slashCommands` message and `toolbox.slashCommands` are the
// same capability; what makes that true is that the page's door calls the same
// two functions rather than assembling a catalog of its own. A second
// assembler would drift on the first engine anybody added, and the symptom
// would be an agent being told about commands the picker never offers.
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8');
    const at = src.indexOf('case \'slashCommands\'');
    const block = at < 0 ? '' : src.slice(at, at + 4000);
    ok('the Console page has a door for the catalog at all', at > 0);
    ok('‼️ …and it answers off the SAME two functions the bridge op uses',
        /scanSlashSources\(/.test(block) && /getSlashCommands\(/.test(block));
    ok('‼️ …rather than a second table nobody would keep in step',
        !/name:\s*'\//.test(block));
    // The picker filters in the page (K-29), so the door must not be a
    // per-keystroke one: it takes no `q` and answers the whole catalog.
    ok('…and it hands over the WHOLE catalog, because the narrowing is the page\'s',
        !/\bq:\s/.test(block));
}

// ---------- the bridge op answers the same way the catalog does ----------
{
    const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
    const { registerToolboxOps } = require(path.join(ROOT, 'out', 'core', 'toolboxBridge.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-slashop-'));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'af-slashhome-'));
    fs.mkdirSync(path.join(tmp, '.claude', 'commands'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.claude', 'commands', 'ship.md'),
        '---\ndescription: send it\n---\nbody', 'utf8');

    const reg = new BridgeRegistry();
    registerToolboxOps(reg, {
        getAgents: () => [{ id: 'a1', name: 'dev', dir: tmp }],
        home,
        cacheFile: path.join(home, 'probe.json'),
        reportedSlash: id => (id === 'h1' ? ['model', 'dataviz'] : undefined)
    });
    ok('the op is in the catalog',
        reg.catalog().some(c => c.op === 'toolbox.slashCommands'));

    (async () => {
        const plain = await reg.dispatch('toolbox.slashCommands', {});
        ok('with nothing asked it answers for claude off the shipped table',
            plain.ok && plain.result.engine === 'claude' && plain.result.count > 0);
        const withAgent = await reg.dispatch('toolbox.slashCommands', { agent: 'dev' });
        ok('naming an agent adds that agent\'s own files',
            withAgent.ok && withAgent.result.commands.some(c => c.name === '/ship'));
        ok('…and the answer says what each layer contributed',
            withAgent.result.sources.commands === 1 && withAgent.result.sources.builtin > 0);
        const live = await reg.dispatch('toolbox.slashCommands', { agent: 'dev', session: 'h1' });
        ok('naming a session adds what THAT process reported',
            live.ok && live.result.commands.some(c => c.name === '/dataviz' && c.reported));
        const ghost = await reg.dispatch('toolbox.slashCommands', { session: 'nope' });
        ok('a session that is not running is refused rather than silently ignored',
            !ghost.ok && /No hosted session/.test(ghost.error));
        const q = await reg.dispatch('toolbox.slashCommands', { agent: 'dev', q: 'ship' });
        ok('the op narrows the same way the box does',
            q.ok && q.result.count === 1 && q.result.commands[0].name === '/ship');

        // ---- K-32: X-97's `provider` is CARRIED, and it does not narrow ----
        //
        // ‼️ MEASURED, OR NOT AT ALL. A provider decides which MODELS a session
        // may run on; nothing anybody has measured says it decides which
        // COMMANDS the CLI offers. So the argument travels — an agent may pass
        // it, and a rule that measures it later will read it — and the answer
        // is deliberately the same list. A filter invented here would take
        // commands away from a picker on the strength of a guess, and the loss
        // would look exactly like a catalog that failed to scan.
        const noProv = await reg.dispatch('toolbox.slashCommands', { agent: 'dev' });
        const withProv = await reg.dispatch('toolbox.slashCommands',
            { agent: 'dev', provider: 'bedrock' });
        ok('a provider is accepted rather than refused', withProv.ok);
        eq('‼️ …and changes nothing, because nothing measured says it should',
            withProv.result.commands.map(c => c.name), noProv.result.commands.map(c => c.name));

        // An engine this build has never measured is not an error: it gets what
        // is on disk plus whatever it reports, which is the honest answer.
        const unknown = await reg.dispatch('toolbox.slashCommands',
            { engine: 'somecli', agent: 'dev' });
        ok('an engine with no shipped table still answers with the files it can see',
            unknown.ok && unknown.result.sources.builtin === 0
            && unknown.result.commands.some(c => c.name === '/ship'));

        fs.rmSync(tmp, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
