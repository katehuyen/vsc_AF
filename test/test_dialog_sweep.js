// U-14 — the extension-wide dialog sweep, and the component that made it
// affordable.
//
// What is actually being defended here:
//   - `media/afForm.js` is the ONE form. Its fields have to publish the key
//     they write and the type they write it as, or `read()` hands a page a
//     string where it expected a number and the object is saved wrong.
//   - a converted command must not quietly grow a dialog back. The scan below
//     is the guard: it reads `extension.ts` and fails if any command on the
//     converted list calls `showInputBox` / `showQuickPick` again.
//   - a surface's form has to make the SAME object every route makes. The page
//     tests post through the real page script, so a form that drops a field is
//     a failing assertion rather than a silent data loss.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'extension.ts'), 'utf8');

// ---------------------------------------------------------------- the scan
/**
 * Every registerCommand body, cut at the NEXT registration **or at its own
 * closing line, whichever comes first**.
 *
 * ‼️ The "next registration" rule alone is wrong for the last command in a
 * `context.subscriptions.push(…)` block: its body then swallows everything up
 * to the next block, and the first sweep reported a fifteen-box command
 * (`missionStepOutput`, which is three lines long and opens no dialog at all).
 * A measurement with a known artefact in it is worse than no measurement,
 * because it sends the next reader to the wrong place.
 */
function commandBodies() {
    const lines = src.split(/\r?\n/);
    const marks = [];
    lines.forEach((l, i) => {
        const m = l.match(/registerCommand\(\s*['"]([^'"]+)['"]/);
        if (m) { marks.push({ cmd: m[1], start: i }); }
    });
    const out = {};
    marks.forEach((mk, k) => {
        const hardEnd = k + 1 < marks.length ? marks[k + 1].start : lines.length;
        let end = hardEnd;
        for (let i = mk.start + 1; i < hardEnd; i++) {
            if (/^ {8}\}\)[,;]?$/.test(lines[i])) { end = i + 1; break; }
        }
        out[mk.cmd] = lines.slice(mk.start, end).join('\n');
    });
    return out;
}

/** The measurement itself, so the number in docs/CONVENTIONS.md is produced by
 *  the same code that guards the converted commands. */
function measure() {
    const rows = Object.values(BODIES).map(b => ({
        native: /showInputBox|showQuickPick|modal:\s*true|showOpenDialog|showSaveDialog/.test(b),
        boxes: (b.match(/showInputBox|showQuickPick/g) || []).length
    }));
    return {
        total: rows.length,
        native: rows.filter(r => r.native).length,
        builders: rows.filter(r => r.boxes > 0).length,
        chains: rows.filter(r => r.boxes >= 2).length
    };
}
const BODIES = commandBodies();

/**
 * The commands this sweep moved onto a page form. A name here is a promise:
 * the object it makes is made by a form, and the command's own job is to open
 * that form. `showWarningMessage({modal:true})` and `showOpenDialog` stay
 * allowed — a destructive confirmation and the OS file picker are deliberate
 * (docs/CONVENTIONS.md, "What stays native").
 */
const CONVERTED = [
    // surface 1 — duties, on the agent page
    'agentfarm.addDuty', 'agentfarm.editDuty', 'agentfarm.addDutyFromTemplate',
    'agentfarm.copyDuty',
    // surface 2 — the toolbox: MCP servers and skills
    'agentfarm.addMcpServer', 'agentfarm.editMcpServer', 'agentfarm.copyMcpServer',
    'agentfarm.addSkill', 'agentfarm.duplicateSkill',
    // surface 3 — memory, on the memory graph
    'agentfarm.addMemory', 'agentfarm.copyMemory', 'agentfarm.fixMemoryIndex',
    'agentfarm.distillMemory', 'agentfarm.askMemory', 'agentfarm.syncMemory',
    // surface 4 — the living checks
    'agentfarm.configureLivingChecks',
    // surface 5 — the vault
    'agentfarm.setSecret', 'agentfarm.deleteSecret',
    // surface 6 — the studio
    'agentfarm.newProduction', 'agentfarm.rerunMedia', 'agentfarm.exportSequence',
    // surface 7 — evals and A/B, on the page the sweep had to build
    'agentfarm.addEvalCase', 'agentfarm.runEvals', 'agentfarm.reviewEvalCases', 'agentfarm.abTest',
    // surface 8 — an agent, and the two capture boxes
    'agentfarm.newAgent', 'agentfarm.importAgentPack',
    'agentfarm.queueAdd', 'agentfarm.backlogAdd'
];

/**
 * ‼️ WHAT IS DELIBERATELY LEFT, AND WHY — so the next sweep does not "finish"
 * it and make the extension worse.
 *
 * A quickpick over rows that ALREADY EXIST is what a quickpick is for; the rule
 * (docs/CONVENTIONS.md) is about MAKING an object. These pick, they do not
 * build: `quickMenu` (the palette itself), `setupExample`, `worktreeRuns`,
 * `browsePackGallery`, `addRecipe`, `startSessionWith`, `assignProject`,
 * `assignSessionProject`, `dismissInsight`, `delegateInsight`, `installHooks`,
 * `terminalRenderFix`, `syncConstitution`, the three `export*` pickers. And a
 * single box asking a single string about a thing that already exists is not a
 * form either: `renameSession`, `tagSession`, `connectTelegram` (a token),
 * `testDispatch` (a diagnostic), `runParallel`.
 *
 * ‼️ M-23 — `compileWiki` is the newest of those, and the clearest: the rows it
 * offers are marks somebody already made, everything is ticked when it opens,
 * and it builds no object at all — it starts a run. Making that a page form
 * would put a builder in front of a gesture whose whole point is one Enter.
 * (U-70 gives the pool its own page; this stays the palette's door to it.)
 */
const KEPT_ON_PURPOSE = [
    'agentfarm.quickMenu', 'agentfarm.setupExample', 'agentfarm.worktreeRuns',
    'agentfarm.browsePackGallery', 'agentfarm.addRecipe', 'agentfarm.startSessionWith',
    'agentfarm.renameSession', 'agentfarm.tagSession', 'agentfarm.connectTelegram',
    'agentfarm.testDispatch', 'agentfarm.runParallel', 'agentfarm.compileWiki',
    // M-16 — pick which objective, then type the steer. Two boxes because there
    // are two facts and neither can be guessed: only a live ADAPTIVE run can be
    // steered, so the picker is the list of runs this can work on (which is
    // also how the reader learns a classic mission has no strategy to steer),
    // and the text is one free sentence. No form, nothing to fill in twice.
    'agentfarm.missionGuide'
];
KEPT_ON_PURPOSE.forEach(cmd => {
    ok(`${cmd} is still there (it is a picker or one question, not a builder)`,
        typeof BODIES[cmd] === 'string');
});

{
    // The measurement, guarded. If a future change pushes these back up, the
    // number in docs/CONVENTIONS.md is wrong and this says so.
    const m = measure();
    // ‼️ THE CEILING ONLY MOVES WITH A NAME. It went 30 → 31 for
    // `agentfarm.compileWiki` (M-23) and 31 → 32 for `agentfarm.missionGuide`
    // (M-16); both are in KEPT_ON_PURPOSE above with the reason. A raise with
    // nothing added to that list is the sweep undoing itself, and the next
    // reader would have no way to tell the two apart.
    ok(`no more than 32 commands use a box (measured ${m.builders} of ${m.total})`, m.builders <= 32);
    ok(`no more than 4 are chains of two or more (measured ${m.chains})`, m.chains <= 4);
    ok('‼️ the scan is not fooled by the last command in a push() block',
        (BODIES['agentfarm.missionStepOutput'] || '').split('\n').length < 8);
}

/**
 * These converted commands keep ONE quickpick, and it is not a defect: it
 * picks among rows that already exist (which project's backlog?) before
 * opening the page's own capture box. A quickpick that chooses an existing
 * thing is what a quickpick is for; the rule is about MAKING one.
 */
const KEEPS_A_PICKER = ['agentfarm.backlogAdd'];

CONVERTED.forEach(cmd => {
    const body = BODIES[cmd];
    ok(`${cmd} still exists`, typeof body === 'string');
    if (typeof body !== 'string') { return; }
    ok(`${cmd} opens no input box`, body.indexOf('showInputBox') < 0);
    if (KEEPS_A_PICKER.indexOf(cmd) < 0) {
        ok(`${cmd} opens no quick pick`, body.indexOf('showQuickPick') < 0);
    }
});

// ------------------------------------------------------------------ AFForm
const AFF = (() => {
    const code = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'afForm.js'), 'utf8');
    const sandbox = { window: {}, document: {} };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.window.AFForm;
})();

{
    ok('the component loads', !!AFF && typeof AFF.card === 'function');

    const t = AFF.text('title', 'Title', 'a & b', { required: true, wide: true, ph: 'x' });
    ok('a text field publishes its key', t.indexOf('data-af="title"') >= 0);
    ok('a text field is typed as a string', t.indexOf('data-aft="s"') >= 0);
    ok('a text field escapes its value', t.indexOf('a &amp; b') >= 0);
    ok('required is shown, not implied', t.indexOf('<em>required</em>') >= 0);
    ok('wide takes the whole row', t.indexOf('aff wide') >= 0);

    const n = AFF.num('priority', 'Priority', 3);
    ok('a number field is typed as a number', n.indexOf('data-aft="n"') >= 0);

    const b = AFF.check('paused', 'paused', true);
    ok('a checkbox is typed as a boolean', b.indexOf('data-aft="b"') >= 0);
    ok('a checked box says so', b.indexOf('checked') >= 0);

    const s = AFF.sel('cadence', 'How often', [{ id: 'daily', label: 'daily', title: 'each day' }], 'daily');
    ok('a picker selects the current value', s.indexOf('value="daily" selected') >= 0);
    ok('an option carries its own hint', s.indexOf('title="each day"') >= 0);

    const p = AFF.path('watch', 'Watched', 'D:/x', { kind: 'file' });
    ok('a path field keeps the OS picker beside it', p.indexOf('data-afbrowse="watch"') >= 0);
    ok('the picker knows what it is picking', p.indexOf('data-afkind="file"') >= 0);

    const r = AFF.sel('k', 'K', ['a', 'b'], 'a', { redraw: true });
    ok('a field that changes the form is marked', r.indexOf('data-afr="1"') >= 0);

    const card = AFF.card({ id: 'x', title: 'New duty', body: t, msg: 'nope', submit: 'Add it' });
    ok('the card carries its id', card.indexOf('id="x"') >= 0);
    ok('the refusal is IN the card', card.indexOf('nope') >= 0);
    ok('the button says what it will do', card.indexOf('Add it') >= 0);
    ok('there is exactly one submit', (card.match(/data-afact="submit"/g) || []).length === 1);
    ok('✕ and Cancel are both cancels', (card.match(/data-afact="cancel"/g) || []).length === 2);

    const list = AFF.list({ items: [{ title: 'one' }, { title: 'two' }] });
    ok('a list draws a row per item', (list.match(/class="affrow/g) || []).length === 2);
    ok('the first row cannot move up', /data-afl="up" data-i="0" disabled/.test(list));
    ok('the last row cannot move down', /data-afl="down" data-i="1" disabled/.test(list));
    ok('an empty list says so instead of drawing nothing',
        AFF.list({ items: [], empty: 'none yet' }).indexOf('none yet') >= 0);
}

// -------------------------------------------------- the duty form on the page
const AGENT_DATA = () => ({
    agent: {
        id: 'a1', name: 'developer', dir: 'D:/agents/developer', active: false,
        contextLoad: { total: 100, claudeMd: 60, memoryIndex: 40, agentsMd: 0 },
        contextBudget: 8000, permissionSummary: 'none',
        claudeMdPath: 'D:/agents/developer/CLAUDE.md', memoryIndexPath: '',
        memoryFiles: [], toolFiles: [], dutiesPath: 'D:/agents/developer/DUTIES.md',
        duties: [
            {
                title: 'Inbox triage', cadence: 'every-turn', paused: false,
                watch: 'D:/in', action: 'file it', note: 'careful',
                status: '2 waiting', pending: true, missing: false
            },
            {
                title: 'Weekly upkeep', cadence: 'weekly', paused: true,
                watch: '', action: 'review memory', status: 'paused',
                pending: false, missing: false
            }
        ]
    },
    contextHealth: {
        memory: { files: 0, tokens: 0, orphans: 0, notRecalled: 0, stale: 0 },
        skills: { total: 0, unused: 0 }, mcp: { total: 0, unused: 0, disabled: 0 },
        duties: { active: 1, paused: 1, lastReadTs: 0, sessionsThisWeek: 0 }
    },
    taskHealth: null,
    totals: { cost: 0, sessions: 0, toolCalls: 0, errors: 0, avgCostPerSession: 0 },
    daily: {}, tools: {}, models: {}, pricing: [], insights: [],
    sessions: [], sessionTableN: 50,
    dutyMeta: {
        cadences: [{ id: 'every-turn', label: 'every-turn', title: 'each turn' },
        { id: 'weekly', label: 'weekly', title: 'each week' }],
        templates: [{
            id: '0', label: 'Inbox triage', detail: 'name and file every document',
            watchKind: 'folder', title: 'Inbox triage', cadence: 'every-turn',
            action: 'Treat every file in there as an inbox entry.'
        }],
        agents: [{ id: 'a2', name: 'manager', titles: ['Weekly upkeep'] }]
    }
});

function agentPage() {
    return runPage('agentDetail.js', AGENT_DATA());
}

{
    const p = agentPage();
    ok('the duty table draws a row per duty',
        (p.html().match(/data-duty="edit"/g) || []).length === 2);
    ok('every duty row can be paused from the row',
        (p.html().match(/data-duty="toggle"/g) || []).length === 2);
    ok('the first duty cannot move up', /data-duty="up" data-t="Inbox triage" disabled/.test(p.html()));
    ok('the last duty cannot move down', /data-duty="down" data-t="Weekly upkeep" disabled/.test(p.html()));
    ok('a duty row publishes its title for the menu',
        p.contexts().some(c => c.dutyTitle === 'Inbox triage'));

    ok('no form is open to begin with', p.html().indexOf('id="dutyform"') < 0);
    p.query('#addDuty')[0].click();
    ok('+ opens the form on the page', p.html().indexOf('id="dutyform"') >= 0);
    ok('the form asks for a title', p.html().indexOf('data-af="title"') >= 0);
    ok('the form asks what to DO', p.html().indexOf('data-af="action"') >= 0);
    ok('the form offers the ready-made patterns', p.html().indexOf('data-af="template"') >= 0);
    ok('a new duty is not asked which agent to copy to', p.html().indexOf('data-af="target"') < 0);
    ok('the watch field keeps the OS picker', p.html().indexOf('data-afbrowse="watch"') >= 0);
}

{
    // Edit: the card opens filled, and every field the old chain asked for is
    // there — including the note, which buildData now has to ship.
    const p = agentPage();
    p.query('[data-duty="edit"]')[0].click();
    const h = p.html();
    ok('edit opens the same card', h.indexOf('id="dutyform"') >= 0);
    ok('edit is filled from the duty', h.indexOf('value="Inbox triage"') >= 0);
    ok('edit carries the note over', h.indexOf('value="careful"') >= 0);
    ok('edit says what it will do', h.indexOf('Save changes') >= 0);
    ok('edit does not offer a template to start from', h.indexOf('data-af="template"') < 0);

    // A <select>'s value and a <textarea>'s content are children, not
    // attributes, so the DOM shim cannot read them off the markup — they are
    // typed in here, which is what a person does anyway.
    p.query('[data-af="cadence"]')[0].value = 'weekly';
    p.query('[data-af="action"]')[0].value = 'file it, then clear the folder';

    p.query('[data-afact="submit"]')[0].click();
    const m = p.last();
    ok('saving posts one message', m.type === 'duty-save');
    ok('the save says it is an edit', m.duty.mode === 'edit');
    ok('the save names the block it replaces', m.duty.oldTitle === 'Inbox triage');
    ok('the save carries the cadence as chosen', m.duty.cadence === 'weekly');
    ok('the save carries the watch', m.duty.watch === 'D:/in');
    ok('the save carries the action as typed', m.duty.action === 'file it, then clear the folder');
    ok('the save carries the note', m.duty.note === 'careful');
    ok('the save carries the paused flag as a boolean', m.duty.paused === false);
}

{
    // Copy: the target picker is the whole difference, and the page already
    // knows which agent would clash.
    const p = agentPage();
    p.query('[data-duty="copy"]')[1].click();
    const h = p.html();
    ok('copy asks which agent', h.indexOf('data-af="target"') >= 0);
    ok('copy warns about a title that already exists there',
        h.indexOf('already has this title') >= 0);
    ok('copy says what it will do', h.indexOf('Copy it') >= 0);
}

{
    // The single acts do not open a form — there is nothing to fill in.
    const p = agentPage();
    p.query('[data-duty="toggle"]')[0].click();
    ok('pause goes straight to the host', p.last().type === 'duty-act' && p.last().act === 'toggle');
    ok('pause names the duty', p.last().title === 'Inbox triage');
    p.query('[data-duty="del"]')[1].click();
    ok('delete goes straight to the host', p.last().act === 'del');
    ok('no form was opened for either', p.html().indexOf('id="dutyform"') < 0);
}

{
    // The palette's own route: the host asks the page to open the card.
    const p = agentPage();
    p.send({ type: 'duty-compose', seed: { mode: 'new' } });
    ok('the host can open the form', p.html().indexOf('id="dutyform"') >= 0);
    p.send({ type: 'duty-msg', text: 'A duty needs a title.', ok: false });
    ok('a refusal keeps the form open', p.html().indexOf('id="dutyform"') >= 0);
    ok('a refusal is shown in the form', p.html().indexOf('A duty needs a title.') >= 0);
    p.send({ type: 'duty-msg', text: 'Duty added.', ok: true });
    ok('a receipt closes the form', p.html().indexOf('id="dutyform"') < 0);
    ok('a receipt is still readable', p.html().indexOf('Duty added.') >= 0);
}

{
    // The OS picker's answer lands in the field that asked for it, and nothing
    // else about the half-filled form is disturbed.
    const p = agentPage();
    p.query('#addDuty')[0].click();
    p.query('[data-afbrowse="watch"]')[0].click();
    ok('the browse button asks the host', p.last().type === 'af-browse');
    ok('it says which field it is for', p.last().key === 'watch');
    p.send({ type: 'af-browsed', key: 'watch', path: 'D:/inbox' });
    ok('the answer lands in the field', p.html().indexOf('value="D:/inbox"') >= 0);
}

// ------------------------------------------------- the toolbox form (surface 2)
const TOOLBOX_DATA = () => ({
    generatedAt: Date.now(),
    agents: [{ id: 'a1', name: 'dev' }, { id: 'a2', name: 'manager' }],
    counts: {
        skill: { user: 0, agent: 1 }, subagent: { user: 0, agent: 0 },
        command: { user: 0, agent: 0 }, mcp: { user: 0, agent: 1 },
        hook: { user: 0, agent: 0 }, plugin: { user: 0, agent: 0 },
        style: { user: 0, agent: 0 }, settings: { user: 0, agent: 0 }
    },
    probeCache: {},
    paths: { userClaudeDir: 'C:/u/.claude', userConfigJson: 'C:/u/.claude.json' },
    items: [
        {
            kind: 'skill', scope: 'agent', agentId: 'a1', agentName: 'dev',
            name: 'release-notes', description: 'write them',
            source: 'D:/a/.claude/skills/release-notes/SKILL.md',
            dir: 'D:/a/.claude/skills/release-notes', detail: {}
        },
        {
            kind: 'mcp', scope: 'agent', agentId: 'a1', agentName: 'dev',
            name: 'obsidian', description: 'node bridge.js',
            source: 'D:/a/.mcp.json', detail: { transport: 'stdio', disabled: false }
        }
    ]
});

function toolboxPage() {
    const p = runPage('toolbox.js', TOOLBOX_DATA());
    return {
        p, tab: id => { const b = p.query(`[data-tab="${id}"]`)[0]; if (b) { b.click(); } }
    };
}

{
    const { p, tab } = toolboxPage();
    tab('skill');
    ok('the skills tab offers to make one', p.html().indexOf('data-new="skill"') >= 0);
    p.query('[data-new="skill"]')[0].click();
    const h = p.html();
    ok('+ opens the card on the page', h.indexOf('id="toolform"') >= 0);
    ok('a skill is asked for its name', h.indexOf('data-af="name"') >= 0);
    ok('a skill is asked for the description claude loads it by', h.indexOf('data-af="description"') >= 0);
    ok('a skill is asked which scope it belongs to', h.indexOf('data-af="agentId"') >= 0);
    ok('a skill is not asked about a transport', h.indexOf('data-af="transport"') < 0);

    p.query('[data-af="name"]')[0].value = 'release-notes';
    p.query('[data-afact="submit"]')[0].click();
    const m = p.last();
    ok('saving posts one message', m.type === 'tool-save');
    ok('the save says which kind it is', m.tool.kind === 'skill');
    ok('the save carries the name', m.tool.name === 'release-notes');
}

{
    // ‼️ The whole point of surface 2: an MCP server's arguments, environment
    // and headers. No chain of input boxes ever asked for any of them.
    const { p, tab } = toolboxPage();
    tab('mcp');
    ok('the MCP tab can make a server now', p.html().indexOf('data-new="mcp"') >= 0);
    p.query('[data-new="mcp"]')[0].click();
    let h = p.html();
    ok('a server is asked which agent it belongs to', h.indexOf('data-af="agentId"') >= 0);
    ok('a stdio server is asked for its command', h.indexOf('data-af="command"') >= 0);
    ok('…and its arguments, one per line', h.indexOf('data-af="args"') >= 0);
    ok('…and the environment it starts with', h.indexOf('data-af="env"') >= 0);
    ok('a stdio server is not asked for a URL', h.indexOf('data-af="url"') < 0);

    // The transport redraws the half of the card that depends on it.
    p.query('[data-af="transport"]')[0].value = 'http';
    p.query('[data-af="transport"]')[0].fire('change');
    h = p.html();
    ok('choosing http redraws the card', h.indexOf('data-af="url"') >= 0);
    ok('…and takes the command away', h.indexOf('data-af="command"') < 0);
    ok('…and asks for headers instead of env', h.indexOf('data-af="headers"') >= 0 && h.indexOf('data-af="env"') < 0);
}

{
    const { p, tab } = toolboxPage();
    tab('mcp');
    p.send({
        type: 'tool-compose',
        seed: { kind: 'mcp', mode: 'copy', agentId: 'a1', name: 'obsidian' }
    });
    ok('the palette can open the copy card', p.html().indexOf('id="toolform"') >= 0);
    ok('copy asks which agent it goes to', p.html().indexOf('data-af="target"') >= 0);
    const picker = (() => {
        const at = p.html().indexOf('data-af="target"');
        return at < 0 ? '' : p.html().slice(at, p.html().indexOf('</select>', at));
    })();
    ok('copy offers the other agent', picker.indexOf('value="a2"') >= 0);
    ok('‼️ copy does not offer the agent it is already on', picker.indexOf('value="a1"') < 0);
    p.send({ type: 'tool-msg', text: 'Copied to manager.', ok: true });
    ok('a receipt closes the card', p.html().indexOf('id="toolform"') < 0);
    ok('…and is still readable', p.html().indexOf('Copied to manager.') >= 0);
}

// ------------------------------------------- the memory surface (surface 3)
const MEM_DATA = () => ({
    generatedAt: Date.now(),
    selectAgentId: 'a1',
    agents: [{
        id: 'a1', name: 'dev',
        graph: {
            nodes: [{
                name: 'project-x.md', path: 'D:/a/memory/project-x.md', tokens: 800,
                mtime: Date.now() - 86400000, incoming: 0, outgoing: 0, recalls: 0,
                inIndex: false, type: 'project', description: 'a project'
            }],
            links: []
        },
        fixes: [
            { kind: 'add', target: 'project-x.md', line: '- [Project X](project-x.md) — a project' },
            { kind: 'remove', target: 'gone.md', line: '- [Gone](gone.md) — nothing' }
        ],
        files: [{
            name: 'project-x.md', path: 'D:/a/memory/project-x.md', tokens: 800,
            mtime: Date.now() - 86400000, staleDays: 1, stale: false
        }]
    }],
    allAgents: [{ id: 'a1', name: 'dev' }, { id: 'a2', name: 'manager' }],
    memoryTypes: ['project', 'feedback', 'user', 'reference'],
    duplicates: [{
        name: 'shared.md', identical: false,
        copies: [
            { agentId: 'a1', agentName: 'dev', path: 'D:/a/memory/shared.md', mtime: Date.now(), size: 2048 },
            { agentId: 'a2', agentName: 'manager', path: 'D:/b/memory/shared.md', mtime: Date.now() - 7200000, size: 1024 }
        ]
    }],
    embeddingsOn: true,
    canDistill: true
});

const memPage = () => runPage('memgraph.js', MEM_DATA());

{
    const p = memPage();
    const h = p.html();
    ok('the memory page says what it can do, not only what there is',
        h.indexOf('data-memcard="new"') >= 0 && h.indexOf('data-memcard="sync"') >= 0);
    ok('the repair button counts the problems before it is pressed',
        h.indexOf('Repair index (2)') >= 0);
    ok('the shared button says how many have drifted apart',
        h.indexOf('Shared (1⚠)') >= 0);
    ok('asking the fleet is offered when embeddings are configured',
        /data-memcard="ask"(?![^>]*disabled)/.test(h));
}

{
    const p = memPage();
    p.query('[data-memcard="new"]')[0].click();
    const h = p.html();
    ok('+ New memory opens a card', h.indexOf('id="memcard"') >= 0);
    ok('it asks for the file name', h.indexOf('data-af="name"') >= 0);
    ok('it asks for the type', h.indexOf('data-af="type"') >= 0);
    ok('it asks for the description that becomes the index line',
        h.indexOf('data-af="description"') >= 0);
    p.query('[data-af="name"]')[0].value = 'project-y';
    p.query('[data-af="description"]')[0].value = 'what it answers';
    p.query('[data-afact="submit"]')[0].click();
    const m = p.last();
    ok('it posts one save', m.type === 'mem-save' && m.mem.mode === 'new');
    ok('the save carries the name', m.mem.name === 'project-y');
    ok('the save carries the description', m.mem.description === 'what it answers');
}

{
    // ‼️ The index repair was a multi-pick with the index it was repairing
    // nowhere in sight. Here every fix is a row AND a tick, and what is sent is
    // the exact lines still ticked.
    const p = memPage();
    p.query('[data-memcard="index"]')[0].click();
    ok('the repair card lists both kinds of problem',
        p.html().indexOf('project-x.md') >= 0 && p.html().indexOf('gone.md') >= 0);
    ok('every fix has its own tick', p.html().indexOf('data-af="k0"') >= 0 && p.html().indexOf('data-af="k1"') >= 0);
    const tick = p.query('[data-af="k1"]')[0];
    tick.checked = false;
    tick.fire('change');
    p.query('[data-afact="submit"]')[0].click();
    const m = p.last();
    ok('applying sends the exact lines that stayed ticked',
        m.type === 'mem-fix' && m.lines.length === 1 && m.lines[0].indexOf('Project X') >= 0);
}

{
    // The sync chain was five quickpicks. It is one card with the whole picture.
    const p = memPage();
    p.query('[data-memcard="sync"]')[0].click();
    const h = p.html();
    ok('the shared card names the file', h.indexOf('shared.md') >= 0);
    ok('…and says it has diverged', h.indexOf('DIVERGED') >= 0);
    ok('…and lists every copy with its age and size', h.indexOf('manager') >= 0 && h.indexOf('2.0 KB') >= 0);
    ok('…and offers a comparison of two named copies',
        h.indexOf('data-af="left"') >= 0 && h.indexOf('data-af="right"') >= 0);
    ok('…and a merge draft', h.indexOf('data-memact="merge"') >= 0);
    ok('…and a source of truth', h.indexOf('data-af="source"') >= 0);
    p.query('[data-memact="diff"]')[0].click();
    ok('comparing goes to the real diff editor', p.last().type === 'mem-sync' && p.last().act === 'diff');
}

{
    const p = memPage();
    p.query('[data-memcard="ask"]')[0].click();
    p.query('[data-af="query"]')[0].value = 'sleep pattern';
    p.query('[data-afact="submit"]')[0].click();
    ok('asking posts the query', p.last().type === 'mem-ask' && p.last().query === 'sleep pattern');
    p.send({
        type: 'mem-hits', query: 'sleep pattern',
        hits: [{ agent: 'dev', title: 'user-profile.md', score: 0.82, text: 'sleeps late', file: 'D:/a/memory/user-profile.md' }]
    });
    const h = p.html();
    ok('‼️ the answer is drawn on the page, not as a list of one-line labels',
        h.indexOf('user-profile.md') >= 0 && h.indexOf('82%') >= 0 && h.indexOf('sleeps late') >= 0);
    ok('each hit can be opened', h.indexOf('data-memopen=') >= 0);
}

{
    const p = memPage();
    p.send({ type: 'mem-compose', seed: { kind: 'copy', path: 'D:/a/memory/project-x.md', fileName: 'project-x.md' } });
    ok('the palette can open the copy card', p.html().indexOf('data-af="target"') >= 0);
    ok('it names what is being copied', p.html().indexOf('project-x.md') >= 0);
    p.send({ type: 'mem-msg', text: 'Copied to manager.', ok: true });
    ok('a receipt closes the card', p.html().indexOf('id="memcard"') < 0);
}

// ------------------------------------------- the panels' OWN dialogs (‼️)
// The scan above reads extension.ts only. A panel may open its own boxes and
// the number will not move — which is exactly what the Toolbox's "+ new skill"
// did for three versions. These four panels are swept; the ones that stay are
// named, so a new one cannot slip in unnoticed.
{
    const PANEL_ALLOW = {
        // a destructive confirmation, and the OS file picker — both deliberate
        'toolboxPanel.ts': [],
        'secretsPanel.ts': [],
        'studioPanel.ts': ['showQuickPick'],   // scene status, named by the menu
        'livingPanel.ts': [],
        'memoryGraph.ts': [],
        'agentDetail.ts': []
    };
    for (const file of Object.keys(PANEL_ALLOW)) {
        const src2 = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'panels', file), 'utf8');
        const found = [];
        if (src2.indexOf('showInputBox') >= 0) { found.push('showInputBox'); }
        if (src2.indexOf('showQuickPick') >= 0) { found.push('showQuickPick'); }
        const unexpected = found.filter(f => PANEL_ALLOW[file].indexOf(f) < 0);
        ok(`${file} builds no object out of dialog boxes`, unexpected.length === 0);
    }
}

// ---------------------------------------- the living checks (surface 4)
const LIVING_DATA = () => ({
    generatedAt: Date.now(), score: 80, verdict: 'alive',
    counts: { ok: 2, warn: 1, dead: 0, idle: 0 },
    signals: [], recent: [], hasChecks: true, canEdit: true,
    checks: [{
        label: "Today's day file", when: { kind: 'fileMissing', path: 'D:/x/{today}.md' },
        level: 'warn', hint: 'write it'
    }]
});

{
    const p = runPage('livingPage.js', LIVING_DATA());
    ok('the button says how many checks there are', p.html().indexOf('Configure checks (1)') >= 0);
    p.query('#cfg')[0].click();
    let h = p.html();
    ok('it opens the editor on the page', h.indexOf('id="checksbox"') >= 0);
    ok('‼️ and the FIRST thing it shows is the list it is adding to',
        h.indexOf('day file') >= 0 && h.indexOf('D:/x/{today}.md') >= 0);
    ok('nothing is open for editing until you pick one', h.indexOf('id="checkcard"') < 0);

    p.query('[data-afl="edit"]')[0].click();
    h = p.html();
    ok('editing one opens it in place', h.indexOf('id="checkcard"') >= 0);
    ok('the condition is a field, not the first question', h.indexOf('data-af="kind"') >= 0);
    ok('the path keeps the OS picker', h.indexOf('data-afbrowse="path"') >= 0);
    ok('how loud is a field too', h.indexOf('data-af="level"') >= 0);

    // The kind decides which fields exist.
    p.query('[data-af="kind"]')[0].value = 'folderHasFiles';
    p.query('[data-af="kind"]')[0].fire('change');
    h = p.html();
    ok('a folder check asks what does NOT count as work', h.indexOf('data-af="except"') >= 0);
    ok('…and whether to look into sub-folders', h.indexOf('data-af="recursive"') >= 0);
    ok('…and a file check\'s hour window is gone', h.indexOf('data-af="hours"') < 0);

    // A <select>'s value is a child, not an attribute, so the shim cannot read
    // it back off the redrawn markup — it is stated again here, which is what
    // the browser does for free.
    p.query('[data-af="kind"]')[0].value = 'folderHasFiles';
    p.query('[data-af="except"]')[0].value = '_LOG_.md';
    p.query('[data-afact="submit"]')[0].click();
    const m = p.last();
    ok('saving sends the WHOLE list, not one command per change',
        m.type === 'checks-save' && Array.isArray(m.checks) && m.checks.length === 1);
    ok('the saved row carries the kind it was changed to', m.checks[0].kind === 'folderHasFiles');
    ok('…and the names that do not count as work', m.checks[0].except === '_LOG_.md');
}

{
    const p = runPage('livingPage.js', LIVING_DATA());
    p.query('#cfg')[0].click();
    p.query('[data-chk="add"]')[0].click();
    ok('a second check can be added without leaving the card',
        (p.html().match(/class="affrow/g) || []).length === 2);
    p.query('[data-afl="del"]')[0].click();
    ok('…and removed again', (p.html().match(/class="affrow/g) || []).length === 1);
    ok('‼️ nothing was written — the list is the draft until Save',
        !p.posted.some(x => x.type === 'checks-save'));
}

// ------------------------------------------------- the vault (surface 5)
const SEC_DATA = () => ({
    agentCount: 2,
    agents: [{ id: 'a1', name: 'dev' }, { id: 'a2', name: 'manager' }],
    secrets: [{
        name: 'FAL_KEY', description: 'fal.ai', allAgents: true, agents: [], updatedAt: Date.now()
    }]
});

{
    const p = runPage('secrets.js', SEC_DATA());
    p.query('#sec-add')[0].click();
    const h = p.html();
    ok('the vault can fill itself now', h.indexOf('id="secform"') >= 0);
    ok('a new secret is asked for its name', h.indexOf('data-af="name"') >= 0);
    ok('…its value, as a password field', /data-af="value"[^>]*type="password"|type="password"[^>]*data-af="value"/.test(h));
    ok('…what it is for', h.indexOf('data-af="description"') >= 0);
    ok('…and who may use it, in the same card', h.indexOf('data-af="ag_a1"') >= 0 && h.indexOf('data-af="ag_a2"') >= 0);
    ok('‼️ and it says what "none ticked" means, because it is the opposite of the usual',
        h.indexOf('Unrestricted: every agent') >= 0);

    p.query('[data-af="name"]')[0].value = 'TG_TOKEN';
    p.query('[data-af="value"]')[0].value = 'hunter2';
    p.query('[data-af="ag_a1"]')[0].checked = true;
    p.query('[data-af="ag_a1"]')[0].fire('change');
    p.query('[data-afact="submit"]')[0].click();
    const m = p.last();
    ok('saving posts one message', m.type === 'sec-save');
    ok('the save carries the name', m.secret.name === 'TG_TOKEN');
    ok('the save carries the scope as agent ids', JSON.stringify(m.secret.agents) === '["a1"]');
}

// ------------------------------------------------ the studio (surface 6)
const STUDIO_DATA = () => ({
    generatedAt: Date.now(), tab: 'assets', project: 'p1',
    agents: [{ id: 'a1', name: 'media' }],
    productions: [{
        id: 'p1', title: 'Launch Film', progress: { approved: 0, total: 2 },
        summary: '', matrix: [], unassigned: [],
        scenes: [
            { id: 's1', title: 'Opening', status: 'draft', thumbs: [], next: '' },
            { id: 's2', title: 'Closing', status: 'draft', thumbs: [], next: '' }
        ]
    }],
    loose: [], untriaged: [], cost: { month: 0 },
    items: [{
        taskId: 't1', title: 'shot 1', model: 'fal-ai/flux', projectId: 'p1',
        input: '{"prompt": "a wide shot"}', estCost: 0.01, ts: Date.now(),
        source: 'fal', selectedCount: 0, rejectedCount: 0, kind: 'image'
    }],
    sequence: [], providers: { fal: true, replicate: false },
    ingestFolders: [], candidates: 0
});

{
    const p = runPage('studio.js', STUDIO_DATA());
    p.query('[data-vary="t1"]')[0].click();
    const h = p.html();
    ok('varying a generation opens a card', h.indexOf('id="studiocard"') >= 0);
    ok('‼️ the JSON input gets a real box, not one line',
        /<textarea[^>]*data-af="input"/.test(h) || /data-af="input"[^>]*rows=/.test(h));
    ok('the model is stated, not asked for', h.indexOf('fal-ai/flux') >= 0);
    p.query('[data-afact="submit"]')[0].click();
    ok('it posts one save', p.last().type === 'studio-save' && p.last().form.kind === 'vary');
}

{
    const p = runPage('studio.js', STUDIO_DATA());
    p.query('[data-assign="t1"]')[0].click();
    const h = p.html();
    ok('assigning opens a card with every scene in it', h.indexOf('data-af="target"') >= 0);
    ok('…and each row names its production, so two "Opening" scenes are tellable apart',
        h.indexOf('Launch Film · Opening') >= 0);
    ok('…and detaching is the first row', h.indexOf('detach it from every production') >= 0);
}

{
    const p = runPage('studio.js', STUDIO_DATA());
    p.send({ type: 'studio-compose', seed: { kind: 'production' } });
    const h = p.html();
    ok('a new production asks which agent folder', h.indexOf('data-af="agentId"') >= 0);
    ok('‼️ and its scenes are ONE PER LINE — a comma in a title used to split it in two',
        h.indexOf('data-af="scenes"') >= 0 && h.indexOf('one per line') >= 0);
}

// ------------------------------------------------- evals (surface 7) — a page
// that had to be BUILT, not converted: everything else in the sweep already had
// a page that listed the object and could not make it. Evals had neither.
const EV_DATA = () => ({
    agentId: 'a1',
    agents: [{ id: 'a1', name: 'dev', cases: 2 }, { id: 'a2', name: 'manager', cases: 0 }],
    hasClaudeMd: true,
    runArgs: '--model claude-haiku-4-5-20251001',
    cases: [
        { id: 'c1', title: 'turkish answer', input: 'özetle', expectation: 'answers in Turkish', source: 'quality', createdAt: 1, disabled: false },
        { id: 'c2', title: 'three points', input: 'öneriler', expectation: 'gives three concrete suggestions', source: 'manual', createdAt: 2, disabled: false }
    ],
    candidates: [{ id: 'q:s1', label: '⭐ 2/5 — özetle', detail: 'too long', input: 'özetle', source: { kind: 'quality' } }],
    suggestions: [{ id: 'sg1', rule: 'always answer in Turkish' }],
    runs: [
        { id: 'r2', ts: 2000, passed: 1, failed: 1, results: [{ caseId: 'c1', title: 'turkish answer', pass: true }, { caseId: 'c2', title: 'three points', pass: false }] },
        { id: 'r1', ts: 1000, passed: 2, failed: 0, results: [{ caseId: 'c1', title: 'turkish answer', pass: true }, { caseId: 'c2', title: 'three points', pass: true }] }
    ],
    verdicts: [
        { caseId: 'c1', pass: true, was: true, change: 'same', reason: 'ok', durationMs: 10 },
        { caseId: 'c2', pass: false, was: true, change: 'regressed', reason: 'only two', durationMs: 12 }
    ],
    lastTs: 2000, prevTs: 1000
});

const evPage = () => runPage('evals.js', EV_DATA());

{
    const p = evPage();
    const h = p.html();
    ok('the evals page lists the cases', h.indexOf('turkish answer') >= 0 && h.indexOf('three points') >= 0);
    ok('‼️ and says WHAT CHANGED since the previous run — the one thing a quickpick could never say',
        h.indexOf('regressed') >= 0);
    ok('the summary counts the regressions', h.indexOf('1 regressed') >= 0);
    ok('the run button says how many cases it would replay', h.indexOf('Run the set (2)') >= 0);
    ok('every case row publishes itself for the menu',
        p.contexts().some(c => c.evCase === 'c1'));
    ok('runs are listed with their pass rate', h.indexOf('100%') >= 0 && h.indexOf('50%') >= 0);
}

{
    const p = evPage();
    p.query('#newcase')[0].click();
    const h = p.html();
    ok('+ New case opens a card', h.indexOf('id="evcard"') >= 0);
    ok('‼️ it offers the BAD TRACES a case is normally born from',
        h.indexOf('data-af="from"') >= 0 && h.indexOf('2/5') >= 0);
    ok('it asks for the input', h.indexOf('data-af="input"') >= 0);
    ok('it asks for the expectation the judge is handed', h.indexOf('data-af="expectation"') >= 0);

    p.query('[data-af="input"]')[0].value = 'a prompt';
    p.query('[data-af="expectation"]')[0].value = 'must be short';
    p.query('[data-afact="submit"]')[0].click();
    const m = p.last();
    ok('saving posts one message', m.type === 'ev-case-save');
    ok('the save carries the input', m.form.input === 'a prompt');
    ok('the save carries the expectation', m.form.expectation === 'must be short');
}

{
    const p = evPage();
    p.query('#abtest')[0].click();
    const h = p.html();
    ok('A/B opens its own card', h.indexOf('id="evcard"') >= 0);
    ok('‼️ an open suggestion is offered as the readiest variant B',
        h.indexOf('always answer in Turkish') >= 0);
    ok('the comparison prompts are prefilled from the eval cases',
        h.indexOf('data-af="prompts"') >= 0);
}

{
    const p = evPage();
    p.query('[data-del="c1"]')[0].click();
    ok('deleting a case goes to the host, which keeps its modal',
        p.last().type === 'ev-case-delete' && p.last().id === 'c1');
}

// ------------------------------------------ an agent itself (surface 8)
const PF_DATA = () => ({
    generatedAt: Date.now(),
    rows: [], projects: [], dormantDays: 14,
    roots: ['D:/zone/agent/ajanlar'],
    models: [{ id: '', label: '— no model key: the CLI default applies —' }, { id: 'opus', label: 'opus' }],
    defaultModel: 'sonnet',
    canCreate: true
});

{
    const p = runPage('portfolio.js', PF_DATA());
    ok('the fleet page offers to make an agent', p.html().indexOf('id="pf-new"') >= 0);
    p.query('#pf-new')[0].click();
    const h = p.html();
    ok('+ New agent opens a card', h.indexOf('id="agentform"') >= 0);
    ok('it asks for the name', h.indexOf('data-af="name"') >= 0);
    ok('‼️ it asks for the default model — the old chain could not', h.indexOf('data-af="model"') >= 0);
    ok('‼️ …and for what the agent is FOR, which goes into its CLAUDE.md',
        h.indexOf('data-af="mission"') >= 0);
    ok('one root is stated rather than asked about', h.indexOf('D:/zone/agent/ajanlar') >= 0);

    p.query('[data-af="name"]')[0].value = 'researcher';
    p.query('[data-afact="submit"]')[0].click();
    const m = p.last();
    ok('creating posts one message', m.type === 'agent-new');
    ok('the message carries the name', m.form.name === 'researcher');
}

{
    const p = runPage('portfolio.js', PF_DATA());
    p.send({
        type: 'agent-compose',
        seed: { mode: 'import', packFile: 'D:/x.agentpack', name: 'imported', packSummary: '"pack" — 4 file(s)', packNotes: 'watch out' }
    });
    const h = p.html();
    ok('an import opens the same card in import mode', h.indexOf('id="agentform"') >= 0);
    ok('‼️ and the pack\'s contents are STATED, not recited in a modal', h.indexOf('4 file(s)') >= 0);
    ok('the pack\'s own notes come with it', h.indexOf('watch out') >= 0);
    ok('an import is not asked for a mission line', h.indexOf('data-af="mission"') < 0);
}

console.log(`test_dialog_sweep: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
