// Search S1-S5: tool-traffic coverage with dialog-default roles, scope tiers
// (files / time window / agent), per-turn tagging, memory + live-event sources,
// the regex time budget, and the grouped webview rendering.
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S = require(path.join(__dirname, '..', 'out', 'core', 'search.js'));
const createAfmsDom = require(path.join(__dirname, 'lib_afms_dom.js'));

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-search-'));
const tfile = (name, lines) => {
    const p = path.join(tmpdir, name);
    fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
    return p;
};
const T = (m) => `2026-07-15T10:${String(m).padStart(2, '0')}:00.000Z`;
const TS = (m) => Date.parse(T(m));

// ---------- engine: roles, turns, tool traffic ----------
{
    const f = tfile('a.jsonl', [
        { type: 'user', timestamp: T(1), message: { content: 'please refactor the parser' } },
        { type: 'assistant', timestamp: T(2), message: { content: [{ type: 'text', text: 'starting with the tokenizer' }, { type: 'tool_use', name: 'Edit', input: { file_path: 'D:/proj/tokenizer.js', old_string: 'xx' } }] } },
        { type: 'user', timestamp: T(3), message: { content: [{ type: 'tool_result', content: 'edit applied: tokenizer.js updated' }] } },
        { type: 'user', timestamp: T(4), isSidechain: true, message: { content: 'subagent prompt zebra' } },
        { type: 'user', timestamp: T(5), message: { content: 'now the second phase' } },
        { type: 'assistant', timestamp: T(6), message: { content: [{ type: 'text', text: 'phase two begins' }] } }
    ]);
    const sessions = [{ file: f, agentName: 'dev', title: 'refactor', mtime: TS(6) }];

    // dialog default: tool input text is NOT found
    const r1 = S.searchTranscripts(sessions, 'tokenizer.js');
    ok('dialog default hides tool traffic', r1.hits.length === 0 && r1.filesScanned === 1);

    // roles tool → the Edit input (file path!) is found, with the tool name
    const r2 = S.searchTranscripts(sessions, 'tokenizer.js', { roles: ['tool'] });
    ok('tool input searched on demand', r2.hits.length === 1 && r2.hits[0].role === 'tool' && r2.hits[0].tool === 'Edit');
    ok('tool hit carries its turn + label', r2.hits[0].turn === 1 && r2.hits[0].turnLabel === 'please refactor the parser');

    // roles toolResult → the result body is found
    const r3 = S.searchTranscripts(sessions, 'edit applied', { roles: ['toolResult'] });
    ok('tool result searched on demand', r3.hits.length === 1 && r3.hits[0].role === 'toolResult');

    // everything: all four roles hit the same file
    const r4 = S.searchTranscripts(sessions, 'tokenizer', { roles: ['user', 'assistant', 'tool', 'toolResult'], maxPerFile: 10 });
    ok('everything-mode spans dialog and tool traffic', r4.hits.length === 3
        && r4.hits.map(h => h.role).join(',') === 'assistant,tool,toolResult');

    // dialog hit in turn 2 — turn counter advanced by the second prompt only
    const r5 = S.searchTranscripts(sessions, 'phase two');
    ok('turn counter tracks non-sidechain prompts', r5.hits.length === 1 && r5.hits[0].turn === 2 && r5.hits[0].turnLabel === 'now the second phase');
    const r6 = S.searchTranscripts(sessions, 'zebra');
    ok('sidechain prompts searchable but do not open turns', r6.hits.length === 1 && r6.hits[0].turn === 1);

    // time window = turn scope: restrict to turn 2's window (ts 5..6)
    const r7 = S.searchTranscripts(sessions, 'the', { tsFrom: TS(5), tsTo: TS(6), maxPerFile: 10 });
    ok('time window keeps only in-window hits', r7.hits.length >= 1 && r7.hits.every(h => h.ts >= TS(5) && h.ts <= TS(6)));
}

// ---------- engine: file scope, budget, regex error ----------
{
    const f1 = tfile('b1.jsonl', [{ type: 'user', timestamp: T(1), message: { content: 'needle in b1' } }]);
    const f2 = tfile('b2.jsonl', [{ type: 'user', timestamp: T(2), message: { content: 'needle in b2' } }]);
    const sessions = [
        { file: f1, agentName: 'dev', title: 'b1', mtime: 1 },
        { file: f2, agentName: 'ops', title: 'b2', mtime: 2 }
    ];
    const r1 = S.searchTranscripts(sessions, 'needle', { files: [f2] });
    ok('files scope narrows the scan', r1.filesScanned === 1 && r1.hits.length === 1 && r1.hits[0].file === f2);
    const r2 = S.searchTranscripts(sessions, 'needle', { agentName: 'dev' });
    ok('agent scope still works', r2.hits.length === 1 && r2.hits[0].agentName === 'dev');
    const r3 = S.searchTranscripts(sessions, 'needle', { timeBudgetMs: -1 });
    ok('exhausted time budget reports partial honestly', r3.timedOut === true && r3.truncated === true && r3.filesScanned === 0);
    const r4 = S.searchTranscripts(sessions, '(unclosed', { regex: true });
    ok('invalid regex reports an error', !!r4.error && r4.hits.length === 0);
}

// ---------- engine: multi-agent set scope (agentNames) ----------
{
    const f1 = tfile('c1.jsonl', [{ type: 'user', timestamp: T(1), message: { content: 'needle in c1' } }]);
    const f2 = tfile('c2.jsonl', [{ type: 'user', timestamp: T(2), message: { content: 'needle in c2' } }]);
    const f3 = tfile('c3.jsonl', [{ type: 'user', timestamp: T(3), message: { content: 'needle in c3' } }]);
    const sessions = [
        { file: f1, agentName: 'dev', title: 'c1', mtime: 1 },
        { file: f2, agentName: 'ops', title: 'c2', mtime: 2 },
        { file: f3, title: 'c3', mtime: 3 } // unassigned ("Other projects")
    ];
    const r1 = S.searchTranscripts(sessions, 'needle', { agentNames: ['dev', 'ops'] });
    ok('agent set keeps exactly the picked agents', r1.hits.length === 2
        && r1.hits.every(h => h.agentName === 'dev' || h.agentName === 'ops'));
    const r2 = S.searchTranscripts(sessions, 'needle');
    ok('no set = every agent incl. unassigned sessions', r2.hits.length === 3);
    const r3 = S.searchTranscripts(sessions, 'needle', { agentNames: [] });
    ok('empty set matches nothing, honestly', r3.hits.length === 0 && r3.filesScanned === 0);

    const md = path.join(tmpdir, 'note-set.md');
    fs.writeFileSync(md, 'note about needle');
    ok('memory respects the agent set',
        S.searchMemory([{ file: md, agentName: 'dev' }], 'needle', { agentNames: ['ops'] }).length === 0
        && S.searchMemory([{ file: md, agentName: 'dev' }], 'needle', { agentNames: ['dev', 'ops'] }).length === 1);

    const store2 = path.join(tmpdir, 'live-events-set.jsonl');
    fs.writeFileSync(store2, [
        JSON.stringify({ ts: 1, kind: 'prompt', detail: 'needle a', agentName: 'dev' }),
        JSON.stringify({ ts: 2, kind: 'prompt', detail: 'needle b', agentName: 'ops' })
    ].join('\n'));
    const ev2 = S.searchLiveEvents(store2, 'needle', { agentNames: ['ops'] });
    ok('live events respect the agent set', ev2.length === 1 && ev2[0].agentName === 'ops');
}

// ---------- memory + live-event sources ----------
{
    const md = path.join(tmpdir, 'note.md');
    fs.writeFileSync(md, 'first paragraph about zebras\n\nsecond paragraph about parsers\n\nthird also parsers');
    const hits = S.searchMemory([{ file: md, agentName: 'dev' }], 'parsers');
    ok('memory notes searched per paragraph', hits.length === 2 && hits[0].kind === 'memory' && hits[0].role === 'memory');
    ok('memory hit points at the md file', hits[0].file === md && hits[0].title === 'note.md');
    ok('memory agent filter applies', S.searchMemory([{ file: md, agentName: 'dev' }], 'parsers', { agentName: 'ops' }).length === 0);

    const alive = tfile('alive.jsonl', [{ type: 'user', message: { content: 'x' } }]);
    const store = path.join(tmpdir, 'live-events.jsonl');
    fs.writeFileSync(store, [
        JSON.stringify({ ts: 111, kind: 'prompt', detail: 'orphan gemini prompt', agentName: 'dev' }),
        JSON.stringify({ ts: 222, kind: 'prompt', detail: 'covered gemini prompt', agentName: 'dev', transcriptPath: alive }),
        JSON.stringify({ ts: 333, kind: 'toolStart', tool: 'Bash', detail: 'gemini pruned', agentName: 'dev', transcriptPath: path.join(tmpdir, 'gone.jsonl') })
    ].join('\n'));
    const ev = S.searchLiveEvents(store, 'gemini');
    ok('live events: only orphans surface (no transcript duplicates)', ev.length === 2
        && ev.some(h => h.ts === 111) && ev.some(h => h.ts === 333) && !ev.some(h => h.ts === 222));
    ok('event hits tagged with kind + tool', ev.every(h => h.kind === 'event') && ev.find(h => h.ts === 333).tool === 'Bash');
    ok('missing store is fail-soft', S.searchLiveEvents(path.join(tmpdir, 'nope.jsonl'), 'x').length === 0);
}

// ---------- webview: grouped rendering, scope pill, click routing ----------
{
    const code = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia()
        + fs.readFileSync(path.resolve(__dirname, '../media/search.js'), 'utf8');
    let posted = [];
    let msgHandler = null;
    const els = {};
    function getEl(id) {
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, style: {}, value: '', checked: false, _html: '',
                addEventListener(ev, fn) { this.listeners[ev] = fn; },
                focus() { },
                querySelectorAll(sel) {
                    const list = [];
                    const attr = /\[data-(hit|open-session)\]/.exec(sel);
                    if (!attr) { return list; }
                    const re = attr[1] === 'hit' ? /data-hit="(\d+)"/g : /data-open-session="([^"]*)" data-ts="([^"]*)"/g;
                    let m;
                    while ((m = re.exec(this._html))) {
                        const el = attr[1] === 'hit'
                            ? { dataset: { hit: m[1] } }
                            : { dataset: { openSession: m[1], ts: m[2] } };
                        el.addEventListener = (_e, fn) => { el._click = fn; };
                        list.push(el);
                    }
                    this['_' + attr[1]] = list;
                    return list;
                },
                set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }
            };
        }
        return els[id];
    }
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: { esc: (s) => String(s) },
            __DATA__: {
                agents: ['dev', 'ops'],
                semantic: { provider: 'off', sessions: 0, chunks: 0 },
                preset: { file: 'D:/t/sess1.jsonl', title: 'my session' }
            },
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } }
        },
        document: { getElementById: getEl, querySelectorAll: () => [] },
        setTimeout: () => 0, clearTimeout: () => { }, console, Date
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox); // shell()

    const app = getEl('app');
    ok('scope pill shows the preset session', app._html.includes('Session: my session') && app._html.includes('id="clearscope"'));
    ok('Dialog chip is on by default', /class="chip on" data-preset="dialog"/.test(app._html));
    ok('memory + events sources default on', app._html.includes('id="srcmem" type="checkbox" checked') && app._html.includes('id="srcevents" type="checkbox" checked'));

    // run a search: the message must carry scope + roles + sources
    //
    // ‼️ The source ticks are CHANGED, not just written to. The page holds them
    // in its own state now (U-3) because `shell()` rebuilds the markup on every
    // chip press and a checkbox written as `checked` came back ticked however
    // you had left it — so a value set on the element without telling it is a
    // value the page never hears about, exactly as in a real browser.
    getEl('q').value = 'parser';
    getEl('srcmem').checked = true;
    getEl('srcmem').listeners.change();
    getEl('srcevents').checked = false;
    getEl('srcevents').listeners.change();
    getEl('go').listeners.click();
    const sm = posted.find(p => p.type === 'search');
    ok('search message carries the session scope', sm && sm.file === 'D:/t/sess1.jsonl');
    ok('search message carries dialog roles + source picks', JSON.stringify(sm.roles.sort()) === '["assistant","user"]' && sm.memory === true && sm.events === false);

    // results: two transcript hits in two turns of one session + memory + event
    msgHandler({
        data: {
            type: 'results', semanticStatus: { provider: 'off', sessions: 0, chunks: 0 },
            result: {
                filesScanned: 1, truncated: false,
                hits: [
                    { file: 'D:/t/sess1.jsonl', agentName: 'dev', title: 'my session', ts: 1000, role: 'user', before: '', match: 'parser', after: ' one', turn: 1, turnLabel: 'first ask' },
                    { file: 'D:/t/sess1.jsonl', agentName: 'dev', title: 'my session', ts: 2000, role: 'tool', tool: 'Edit', before: '', match: 'parser', after: ' two', turn: 2, turnLabel: 'second ask' },
                    { file: 'D:/m/note.md', agentName: 'dev', title: 'note.md', ts: 3000, role: 'memory', kind: 'memory', before: '', match: 'parser', after: ' note' },
                    { file: '', agentName: 'dev', title: 'prompt', ts: 4000, role: 'event', kind: 'event', before: '', match: 'parser', after: ' event' }
                ]
            }
        }
    });
    const out = getEl('out');
    ok('session group header rendered', out._html.includes('data-open-session="D:/t/sess1.jsonl"') && out._html.includes('2 hit(s)'));
    ok('turn sub-headers label each turn', out._html.includes('Turn 1 — first ask') && out._html.includes('Turn 2 — second ask'));
    ok('memory + event sections rendered', out._html.includes('Memory notes') && out._html.includes('Live events'));

    posted = [];
    out._hit.find(e => e.dataset.hit === '1')._click();
    ok('transcript hit opens the session at its ts', posted[0] && posted[0].type === 'openSession' && posted[0].ts === 2000);
    posted = [];
    out._hit.find(e => e.dataset.hit === '2')._click();
    ok('memory hit opens the md file', posted[0] && posted[0].type === 'openFile' && posted[0].file === 'D:/m/note.md');
    posted = [];
    out._hit.find(e => e.dataset.hit === '3')._click();
    ok('orphan event hit opens the timeline', posted[0] && posted[0].type === 'openTimeline');
    posted = [];
    out['_open-session'][0]._click();
    ok('group header opens the session', posted[0] && posted[0].type === 'openSession' && posted[0].file === 'D:/t/sess1.jsonl');

    // ---- S-4: the answer opens in the scope the question was asked in -------
    //
    // ‼️ The transcript used to open showing EVERYTHING however narrow the
    // search had been, so a Dialog search landed on a page full of tool calls —
    // answering a question nobody asked. The scope rides along with the click.
    posted = [];
    out._hit.find(e => e.dataset.hit === '0')._click();
    ok('‼️ a hit hands the viewer the kinds the search was made in',
        posted[0] && JSON.stringify((posted[0].roles || []).slice().sort()) === '["assistant","user"]');
    posted = [];
    out['_open-session'][0]._click();
    ok('…and so does the group header, not only the hit',
        posted[0] && (posted[0].roles || []).length === 2);

    // ---- U-3: the filter panel the Sessions and Turns pages already have ----
    ok('a date window is offered, as a WHEN range like the tables',
        app._html.includes('id="f-from"') && app._html.includes('id="f-to"')
        && /class="frange"/.test(app._html));
    ok('…and the results can be ordered rather than only listed',
        app._html.includes('id="f-sort"')
        && ['Newest first', 'Oldest first', 'Most matches', 'By agent']
            .every(s => app._html.includes(s)));
    ok('…with one press back to the defaults',
        app._html.includes('id="f-clear"') && app._html.includes('Clear filters'));
    // Nothing is set yet, so Clear has nothing to do and says so rather than
    // pretending — the same rule the Backlog capture box's ↺ follows.
    ok('…drawn inert while there is nothing to clear', /class="chip off" id="f-clear"/.test(app._html));
    ok('the row says in words which kinds it is searching',
        app._html.includes('→ the conversation'));

    // The window is the engine's own message-time filter, and a day means the
    // WHOLE day — a one-day window with a midnight `to` would find nothing.
    posted = [];
    getEl('f-from').value = '2026-08-01';
    getEl('f-from').listeners.change();
    getEl('go').listeners.click();
    const dated = posted.find(p => p.type === 'search');
    ok('a date window reaches the engine as tsFrom/tsTo',
        dated && dated.tsFrom === Date.parse('2026-08-01T00:00:00.000') && dated.tsTo === 0);
    posted = [];
    getEl('f-to').value = '2026-08-01';
    getEl('f-to').listeners.change();
    getEl('go').listeners.click();
    const both = posted.find(p => p.type === 'search');
    ok('…and "to" is the END of its day, or a one-day window finds nothing',
        both && both.tsTo === Date.parse('2026-08-01T23:59:59.999'));
}

// ---------- U-3: what a click on a kind MEANS ------------------------------
//
// ‼️ THE REPORTED BREAKAGE, AND IT WAS NOT A DRAWING BUG. With Dialog on,
// 🧑 User is lit — so pressing it TOGGLED IT OFF and the search silently became
// "agent replies only": the chip you pressed went dark, the one you did not
// touch stayed lit, and the row read as if the selection had not registered.
// A plain click now means "only this kind", which is also the two questions the
// page most needs ("only my prompts", "only its answers"), one press each.
{
    const src = fs.readFileSync(path.resolve(__dirname, '../media/search.js'), 'utf8');
    ok('‼️ a plain click on a kind means ONLY that kind',
        /\} else \{\s*\n\s*roleSel = new Set\(\[id\]\);\s*\n\s*\}/.test(src));
    ok('…Ctrl/⌘-click keeps the old add-and-remove',
        /if \(ev\.ctrlKey \|\| ev\.metaKey\) \{\s*\n\s*if \(roleSel\.has\(id\)\) \{ roleSel\.delete\(id\); \} else \{ roleSel\.add\(id\); \}/.test(src));
    ok('…and the scope can never be emptied into "matches nothing"',
        /if \(!roleSel\.size\) \{ roleSel = new Set\(\[id\]\); \}/.test(src));
    ok('…the gesture is written down where it is used, not only in the code',
        /Click a kind to search ONLY in it · Ctrl-click \(⌘ on Mac\) to add or remove one/.test(src));
    // Only the session GROUPS are re-ordered: the hits inside one are read
    // forwards, and the turn sub-headers are computed by walking that order.
    ok('sorting moves the groups and never the hits inside a session',
        /const groupTs = g => r\.hits\[g\.hits\[0\]\]\.ts \|\| 0;/.test(src)
        && /ONLY THE GROUPS MOVE/.test(src));
}

// ---------- webview: agent picker (checkbox dropdown, fleet scope) ----------
{
    const code = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia()
        + fs.readFileSync(path.resolve(__dirname, '../media/search.js'), 'utf8');
    let posted = [];
    let msgHandler = null;
    const els = {};
    function getEl(id) {
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, style: {}, value: '', checked: false, _html: '',
                addEventListener(ev, fn) { this.listeners[ev] = fn; },
                focus() { },
                set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }
            };
        }
        return els[id];
    }
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: { esc: (s) => String(s) },
            __DATA__: {
                agents: ['dev', 'ops', 'psy'],
                semantic: { provider: 'off', sessions: 0, chunks: 0 },
                preset: null
            },
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } }
        },
        document: { getElementById: getEl, querySelectorAll: () => [], querySelector: (s) => ms.querySelector(s) },
        setTimeout: () => 0, clearTimeout: () => { }, console, Date
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const ms = createAfmsDom(() => getEl('app')._html);
    vm.runInContext(code, sandbox); // shell()

    const app = getEl('app');
    ok('picker defaults to all agents',
        ms.label('search-agents') === 'Agents: all' && ms.ticked('search-agents').length === 3);

    // untick one agent → subset is sent as an explicit array
    ms.toggle('search-agents', 'ops', false);
    ok('subset label counts the pick', ms.label('search-agents') === 'Agents: 2/3');
    getEl('q').value = 'needle';
    posted = [];
    getEl('go').listeners.click();
    let sm = posted.find(p => p.type === 'search');
    ok('subset search carries exactly the ticked agents', sm && JSON.stringify(sm.agents) === '["dev","psy"]');

    // Clear → empty set (finds nothing, honestly); Select all → null (no filter)
    ms.clear('search-agents');
    ok('Clear unticks everything',
        ms.label('search-agents') === 'Agents: none' && ms.ticked('search-agents').length === 0);
    posted = [];
    getEl('go').listeners.click();
    sm = posted.find(p => p.type === 'search');
    ok('none-selected search sends an empty set', sm && JSON.stringify(sm.agents) === '[]');
    ms.selectAll('search-agents');
    ok('Select all restores the no-filter state',
        ms.label('search-agents') === 'Agents: all' && ms.ticked('search-agents').length === 3);
    posted = [];
    getEl('go').listeners.click();
    sm = posted.find(p => p.type === 'search');
    ok('all-selected search sends no agent filter', sm && sm.agents === null);

    // an arbitrary two-of-three pick — the point of the whole control
    ms.only('search-agents', ['dev', 'psy']);
    posted = [];
    getEl('go').listeners.click();
    sm = posted.find(p => p.type === 'search');
    ok('any subset is expressible (clear, then tick two)', sm && JSON.stringify(sm.agents) === '["dev","psy"]');
    ms.selectAll('search-agents');

    // agent preset → only that agent ticked, single-agent label
    msgHandler({ data: { type: 'preset', preset: { agentName: 'ops' } } });
    ok('agent preset ticks only that agent',
        ms.label('search-agents') === 'Agents: ops' && JSON.stringify(ms.ticked('search-agents')) === '["ops"]');
    ok('agent preset shows the scope pill', app._html.includes('Agent: ops') && app._html.includes('id="clearscope"'));

    // widening the pick retires the stale "Agent: X" pill
    getEl('scope')._html = 'PILL'; // pre-seed: proves dropStaleAgentPreset really clears it
    ms.toggle('search-agents', 'dev', true);
    ok('changed pick retires the agent pill', getEl('scope')._html === ''
        && ms.label('search-agents') === 'Agents: 2/3');
}

fs.rmSync(tmpdir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
