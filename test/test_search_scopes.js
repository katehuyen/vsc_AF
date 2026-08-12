// Search S1-S5 + X-24 family: tool-traffic coverage with dialog-default roles,
// scope tiers (files / time window / agent), per-turn tagging, memory +
// live-event sources, the regex time budget — and the rebuild:
//   X-25  a delegating agent is not a user (delegator / handler)
//   X-35  the other three engines' transcripts are searchable too
//   X-24  the session axis (engine · project · model · origin · lane · id)
//   U-42  the kind chips are badges: a plain click toggles
//   X-34  the id you already know, resolved above the results
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S = require(path.join(__dirname, '..', 'out', 'core', 'search.js'));
const SEM = require(path.join(__dirname, '..', 'out', 'core', 'semantic.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'search.js'));

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
    const sessions = [{ file: f, agentName: 'dev', title: 'refactor', mtime: TS(6), sessionId: 'sess-a' }];

    // dialog default: tool input text is NOT found
    const r1 = S.searchTranscripts(sessions, 'tokenizer.js');
    ok('dialog default hides tool traffic', r1.hits.length === 0 && r1.filesScanned === 1);

    // roles tool → the Edit input (file path!) is found, with the tool name
    const r2 = S.searchTranscripts(sessions, 'tokenizer.js', { roles: ['tool'] });
    ok('tool input searched on demand', r2.hits.length === 1 && r2.hits[0].role === 'tool' && r2.hits[0].tool === 'Edit');
    ok('tool hit carries its turn + label', r2.hits[0].turn === 1 && r2.hits[0].turnLabel === 'please refactor the parser');
    ok('…and the session it is in, so a result can be opened by id',
        r2.hits[0].sessionId === 'sess-a');

    // roles toolResult → the result body is found
    const r3 = S.searchTranscripts(sessions, 'edit applied', { roles: ['toolResult'] });
    ok('tool result searched on demand', r3.hits.length === 1 && r3.hits[0].role === 'toolResult');

    // everything: all roles hit the same file
    const r4 = S.searchTranscripts(sessions, 'tokenizer', { roles: S.ALL_ROLES, maxPerFile: 10 });
    ok('everything-mode spans dialog and tool traffic', r4.hits.length === 3
        && r4.hits.map(h => h.role).join(',') === 'assistant,tool,toolResult');

    // dialog hit in turn 2 — turn counter advanced by the second prompt only
    const r5 = S.searchTranscripts(sessions, 'phase two');
    ok('turn counter tracks non-sidechain prompts', r5.hits.length === 1 && r5.hits[0].turn === 2 && r5.hits[0].turnLabel === 'now the second phase');

    // ‼️ X-25 — the sidechain prompt was written BY AN AGENT, and calling it
    // `user` is what made "search only my prompts" answer with an agent's
    // handover text. It is a kind of its own now, and Dialog no longer carries it.
    const r6 = S.searchTranscripts(sessions, 'zebra');
    ok('‼️ a delegation prompt is NOT in the dialog default', r6.hits.length === 0);
    const r6b = S.searchTranscripts(sessions, 'zebra', { roles: ['delegator'] });
    ok('…it is found as a delegation, and says who delegated',
        r6b.hits.length === 1 && r6b.hits[0].role === 'delegator'
        && r6b.hits[0].speaker === 'dev' && r6b.hits[0].turn === 1);
    ok('…and the delegation preset is two kinds, not one',
        S.DELEGATION_ROLES.join(',') === 'delegator,handler'
        && S.DIALOG_ROLES.join(',') === 'user,assistant');

    // time window = turn scope: restrict to turn 2's window (ts 5..6)
    const r7 = S.searchTranscripts(sessions, 'the', { tsFrom: TS(5), tsTo: TS(6), maxPerFile: 10 });
    ok('time window keeps only in-window hits', r7.hits.length >= 1 && r7.hits.every(h => h.ts >= TS(5) && h.ts <= TS(6)));

    // whole word reaches the engine through the same compiler every box uses
    ok('whole word narrows the engine too',
        S.searchTranscripts(sessions, 'phas', { maxPerFile: 10 }).hits.length === 2
        && S.searchTranscripts(sessions, 'phas', { wholeWord: true, maxPerFile: 10 }).hits.length === 0);
}

// ---------- accounting: a preview cap never becomes a silent match cap ----------
{
    const f = tfile('many.jsonl', Array.from({ length: 9 }, (_, i) => ({
        type: 'user', timestamp: T(i + 1), message: { content: `needle occurrence ${i + 1}` }
    })));
    const r = S.searchTranscripts([{ file: f, agentName: 'dev', title: 'many', mtime: TS(10) }],
        'needle', { maxPerFile: 3 });
    ok('the engine counts every match after the per-session preview cap',
        r.matchesFound === 9 && r.matchesShown === 3 && r.omittedMatches === 6);
    ok('the session carries its honest found/shown accounting',
        r.sessionsMatched === 1 && r.sessionMatches[0].found === 9 && r.sessionMatches[0].shown === 3);
    ok('a capped preview is explicitly partial', r.truncated === true);
}

// ---------- parser: one user record is one turn; literal < text is searchable ----------
{
    const f = tfile('blocks.jsonl', [
        { type: 'user', timestamp: T(1), message: { content: [
            { type: 'text', text: 'first block narwhal' }, { type: 'text', text: 'second block narwhal' }
        ] } },
        { type: 'assistant', timestamp: T(2), message: { content: [{ type: 'text', text: 'answer narwhal' }] } },
        { type: 'user', timestamp: T(3), message: { content: '<literal comparison narwhal' } }
    ]);
    const r = S.searchTranscripts([{ file: f, agentName: 'dev', title: 'blocks', mtime: TS(3) }],
        'narwhal', { maxPerFile: 10 });
    ok('several text blocks in one user record do not invent extra turns',
        r.hits.slice(0, 3).every(h => h.turn === 1));
    ok('ordinary text beginning with < is not discarded as system harness',
        r.hits.length === 4 && r.hits[3].turn === 2);
}

// ---------- semantic ranking is scoped before top-k ----------
{
    const file = path.join(tmpdir, 'semantic.json');
    const idx = new SEM.SemanticIndex(file);
    const chunk = (id, text) => ({ sessionFile: `${id}.jsonl`, sessionId: id, agentName: id,
        title: id, ts: 1, text });
    idx.addSession('a', 1, [chunk('a', 'alpha')], [[1, 0]]);
    idx.addSession('b', 1, [chunk('b', 'beta')], [[0.8, 0.2]]);
    const scoped = idx.search([1, 0], 1, new Set(['b']));
    ok('semantic scope is applied before top-k ranking, not after it',
        scoped.length === 1 && scoped[0].chunk.sessionId === 'b');
}

// ---------- X-25: a subagent's OWN transcript is a delegation lane ----------
{
    const f = tfile('sub.jsonl', [
        { type: 'user', timestamp: T(1), message: { content: 'handle the migration, quokka' } },
        { type: 'assistant', timestamp: T(2), message: { content: [{ type: 'text', text: 'migration done, quokka' }] } }
    ]);
    const sessions = [{ file: f, agentName: 'manager', title: 'sub', mtime: TS(2), isSidechain: true }];
    ok('a subagent transcript carries no `user` at all',
        S.searchTranscripts(sessions, 'quokka').hits.length === 0);
    const r = S.searchTranscripts(sessions, 'quokka', { roles: S.DELEGATION_ROLES, maxPerFile: 5 });
    ok('…both sides of it are delegator + handler',
        r.hits.length === 2 && r.hits[0].role === 'delegator' && r.hits[1].role === 'handler');
    ok('…and only the delegator names who wrote it',
        r.hits[0].speaker === 'manager' && r.hits[1].speaker === undefined);
}

// ---------- X-35: the other engines are transcripts too ----------
{
    // A Codex rollout is not claude JSONL, so the line scanner reads nothing
    // from it — which is exactly how a four-engine fleet stayed searchable on
    // one. The panel hands the engine the very parser the viewer reads them
    // with; here a stub stands in for it.
    const f = path.join(tmpdir, 'codex.jsonl');
    fs.writeFileSync(f, 'not-claude-shaped\n{"payload":{"message":"salamander"}}');
    const sessions = [{
        file: f, agentName: 'dev', title: 'codex run', mtime: 10,
        sessionId: 'sess-cx', engine: 'codex'
    }];
    ok('without a foreign parser it finds nothing, honestly',
        S.searchTranscripts(sessions, 'salamander').hits.length === 0);

    let parsed = 0;
    const parseForeign = () => {
        parsed++;
        return {
            turns: [{ n: 1, label: 'the codex ask' }],
            messages: [
                { role: 'user', ts: 100, text: 'find the salamander', turn: 1 },
                { role: 'assistant', ts: 200, text: 'salamander found', turn: 1 },
                { role: 'tool', ts: 300, tool: 'Bash', input: 'grep salamander src', turn: 1 },
                { role: 'system', ts: 400, text: 'salamander system noise', turn: 1 }
            ]
        };
    };
    const r = S.searchTranscripts(sessions, 'salamander', { parseForeign, maxPerFile: 10 });
    ok('‼️ a foreign transcript is searched through the shared parser',
        r.hits.length === 2 && r.hits.map(h => h.role).join(',') === 'user,assistant');
    ok('…every hit is badged with the engine that wrote it',
        r.hits.every(h => h.engine === 'codex' && h.sessionId === 'sess-cx'));
    ok('…turn labels survive the crossing', r.hits[0].turn === 1 && r.hits[0].turnLabel === 'the codex ask');
    const rt = S.searchTranscripts(sessions, 'grep', { parseForeign, roles: ['tool'] });
    ok('…tool traffic too, name and input together',
        rt.hits.length === 1 && rt.hits[0].tool === 'Bash');
    // the parse is cached by mtime — the page re-searches on every keystroke
    const before = parsed;
    S.searchTranscripts(sessions, 'salamander', { parseForeign });
    ok('…and an unchanged file is parsed once, not once per keystroke', parsed === before);
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

// =========================================================================
// the page
// =========================================================================

/** The page, driven exactly as the shell drives it, with a query typed in. */
function page(extraData) {
    const r = runPage('search.js', Object.assign(fixture.data(), extraData || {}));
    const box = r.query('#q')[0];
    box.value = 'parser';
    box.fire('input');
    return r;
}
const lastSearch = r => r.posted.filter(p => p.type === 'search').pop();
/** Press Search without going through a chip (which repaints first). */
const go = r => r.els.go.fire('click');

// ---------- U-42: the kind chips are badges, and a badge toggles ----------
{
    const r = page();
    const html = r.html();
    ok('all six kinds are offered, delegation among them',
        ['user', 'assistant', 'delegator', 'handler', 'tool', 'toolResult']
            .every(id => html.includes(`data-role="${id}"`)));
    ok('Conversation is the default and visibly selected',
        /class="chip on"[\s\S]*data-preset="dialog"[\s\S]*aria-pressed="true"/.test(html));
    ok('…and the two extra sources are chips now, not checkboxes',
        html.includes('data-source="memory"') && html.includes('data-source="events"')
        && !html.includes('id="srcmem"'));
    ok('‼️ the row no longer repeats itself in words at its end',
        !html.includes('→ the conversation'));

    go(r);
    ok('a search carries the dialog kinds',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","user"]');

    // ‼️ THE FIX U-42 ASKED FOR: two kinds at once, by the obvious gesture.
    r.query('[data-role="tool"]')[0].fire('click');
    ok('‼️ a plain click ADDS a kind — two are searchable at once',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","tool","user"]');
    r.query('[data-role="tool"]')[0].fire('click');
    ok('…and clicking it again takes it away',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","user"]');
    r.query('[data-role="user"]')[0].fire('click', { ctrlKey: true });
    ok('…Ctrl/⌘-click still means ONLY that one',
        JSON.stringify(lastSearch(r).roles) === '["user"]');
    r.query('[data-role="user"]')[0].fire('click');
    ok('…and the scope can never empty into "matches nothing"',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","user"]');
    r.query('[data-preset="delegation"]')[0].fire('click');
    ok('the Delegation preset is one press',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["delegator","handler"]');
    r.query('[data-preset="all"]')[0].fire('click');
    ok('…and Everything is all six', lastSearch(r).roles.length === 6);
    r.query('[data-source="events"]')[0].fire('click');
    ok('a source chip toggles the source', lastSearch(r).events === false && lastSearch(r).memory === true);
}

// ---------- X-24: the session axis ----------
{
    const r = page();
    ok('the compact panel keeps the agent picker visible and detailed filters folded',
        r.html().includes('data-afms="search-agents"')
        && !r.html().includes('id="f-session"') && !r.html().includes('data-afms="f-projects"'));
    ok('the search surface is a compact panel, not a numbered wizard',
        !r.html().includes('1 · Ask') && !r.html().includes('2 · Choose content')
        && !r.html().includes('3 · Narrow sessions'));
    r.els['more-toggle'].fire('click');
    const html = r.html();
    ok('‼️ every axis a session HAS is offered, not just a date',
        ['f-session', 'f-from', 'f-to', 'f-sort'].every(id => html.includes(`id="${id}"`))
        && ['f-engines', 'f-projects', 'f-models'].every(id => html.includes(`data-afms="${id}"`))
        && html.includes('data-origin="auto"') && html.includes('data-lane="sub"')
        && html.includes('data-flag="pinnedOnly"') && html.includes('data-flag="errorsOnly"'));
    ok('…and the pickers are built from what the fleet actually holds',
        html.includes('Antigravity') && html.includes('gpt-5.6-sol')
        && html.includes('PRS.MuratVural_DEV_VSC.AgentFarm'));

    const sess = r.query('#f-session')[0];
    sess.value = '4d361981';
    sess.fire('change');
    r.query('[data-origin="auto"]')[0].fire('click');
    ok('an origin reaches the host as a session filter', lastSearch(r).filters.origin === 'auto');
    r.query('[data-lane="sub"]')[0].fire('click');
    ok('…and so does the subagent lane', lastSearch(r).filters.lane === 'sub');
    r.query('[data-flag="errorsOnly"]')[0].fire('click');
    ok('…and the flags', lastSearch(r).filters.errorsOnly === true);
    ok('‼️ X-34 — the id you already know is a filter of its own',
        lastSearch(r).filters.session === '4d361981');
    ok('the filter badge counts active session filters', r.html().includes('⚙ Filters (4)'));
}

// ---------- the query modes ----------
{
    const r = page();
    ok('text, regex and meaning are distinct modes beside the text options',
        ['data-mode="text"', 'data-mode="regex"', 'data-mode="meaning"', 'data-query-option="whole"']
            .every(x => r.html().includes(x)));
    const w = r.query('[data-query-option="whole"]')[0];
    w.fire('click');
    go(r);
    ok('…and it reaches the engine', lastSearch(r).wholeWord === true);
    ok('the option remains visibly selected after repaint',
        r.html().includes('data-query-option="whole"') && r.html().includes('aria-pressed="true"'));
    ok('the grammar has a card of its own, not only a tooltip',
        !r.html().includes('For example'));
    r.els['guide-toggle'].fire('click');
    const h = r.html();
    ok('…and it opens with the symbol, the meaning and an example',
        h.includes('<th>Example</th>') && h.includes('codex OR gemini') && h.includes('refact*'));
    ok('‼️ …in the language of the interface', !/[çğıöşüÇĞİÖŞÜ]/.test(
        h.slice(h.indexOf('class="guide"'), h.indexOf('class="guide"') + 2500)));
}

// ---------- the workspace tells the truth about meaning search ----------
{
    const r = page();
    r.query('[data-mode="meaning"]')[0].fire('click');
    const html = r.html();
    ok('meaning mode states its indexed-conversation boundary on the page',
        html.includes('<b>Meaning:</b> indexed main-session conversation only')
        && html.includes('message dates do not apply'));
    ok('content kinds are visibly unavailable instead of being silently ignored',
        html.includes('class="chiprow scope-row unavailable"') && html.includes('aria-disabled="true"'));
    go(r);
    ok('meaning reaches the host as its own mode and drops unsupported message dates',
        lastSearch(r).semantic === true && lastSearch(r).tsFrom === 0 && lastSearch(r).tsTo === 0);
}

// ---------- explanatory hover and selection state ----------
{
    const r = page();
    const html = r.html();
    const qTag = (/<input id="q"[^>]*>/.exec(html) || [''])[0];
    ok('the query explanation is a rich AFTip, never a native title',
        html.includes('class="af-tipw query-tip"') && html.includes('class="af-tipb"')
        && !/\btitle=/.test(qTag));
    ok('selected content carries fill class, check mark and aria state together',
        /class="chip on"[\s\S]*data-role="user"[\s\S]*aria-pressed="true"[^>]*>[\s\S]*chip-check[^>]*>✓/.test(html));
}

// ---------- results: engines, delegation, the id banner ----------
{
    const r = runPage('search.js', fixture.data());
    const v = fixture.variants().find(x => x.id === 'results');
    v.act(r);
    const out = r.els.out.innerHTML;
    ok('every engine is badged in the results, not just the default one',
        ['Claude', 'Codex', 'Gemini', 'Antigravity'].every(e => out.includes(`>${e}<`)));
    ok('a delegation hit is named as a handover', out.includes('>handover<'));
    ok('a handler hit is named as a sub-agent reply', out.includes('>sub-agent<'));
    ok('the summary separates found matches from shown previews',
        out.includes('<b>11</b>matches') && out.includes('<b>8</b>previews'));
    ok('memory and event sections still stand apart',
        out.includes('Memory notes') && out.includes('Orphaned events'));

    // ‼️ X-34 — the banner is ABOVE the hits, and it opens the session
    ok('the id resolves to a session, drawn above everything',
        out.includes('id="id-card"') && out.includes('#4d361981'));
    r.posted.length = 0;
    r.els['id-card'].fire('click');
    ok('…and one click opens it',
        r.last().type === 'openSession' && r.last().file === 'D:/s/a.jsonl');

    // the scope rides along with the click, as it always did — and the two
    // delegation kinds arrive as the lines the viewer actually draws
    r.query('[data-preset="delegation"]')[0].fire('click');
    const rr = fixture.variants().find(x => x.id === 'results');
    rr.act(r);
    r.posted.length = 0;
    r.els.out.querySelectorAll('[data-hit]')[0].fire('click');
    ok('‼️ delegation hands the viewer the lines it draws (user/assistant)',
        JSON.stringify((r.last().roles || []).slice().sort()) === '["assistant","user"]');
}

fs.rmSync(tmpdir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
