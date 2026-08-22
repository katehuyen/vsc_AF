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
        // S-36 — the conversation is three kinds now: what a PERSON wrote, what a
        // PROGRAM wrote on the same input channel, and the agent's reply.
        && S.DIALOG_ROLES.join(',') === 'user,automation,assistant');

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

// ---------- the ordinary search box is live; Meaning stays deliberate ----------
{
    const r = runPage('search.js', fixture.data(), {
        setTimeout: fn => { fn(); return 1; }, clearTimeout: () => { }
    });
    const box = r.query('#q')[0];
    box.value = 'parser';
    box.fire('input');
    ok('text search runs again while typing, without waiting for Search',
        lastSearch(r)?.query === 'parser' && lastSearch(r)?.semantic === false);
}

// ---------- ‼️ THE CARET STAYS IN THE BOX WHILE THE BOX SEARCHES ----------
// The reported bug, and the reason a live search was unusable: the page rebuilds
// its whole card, so the answer arriving threw the cursor out of the query box
// and the next letter went nowhere. Every repaint on this path is asserted.
{
    const r = runPage('search.js', fixture.data(), {
        setTimeout: fn => { fn(); return 1; }, clearTimeout: () => { }
    });
    const doc = r.sandbox.document;
    const inBox = () => doc.activeElement && doc.activeElement.id === 'q';
    ok('the page opens with the caret already in the query box', inBox());

    const box = r.query('#q')[0];
    box.value = 'parse';
    box.selectionStart = 5; box.selectionEnd = 5;
    box.fire('input');
    ok('‼️ the repaint the live search causes does not take the focus away', inBox());
    ok('…and the caret is where it was, not back at the first character',
        inBox() && doc.activeElement.selectionStart === 5);

    r.send({ type: 'results', seq: lastSearch(r).seq, result: fixture.RESULT });
    ok('‼️ …nor does the ANSWER arriving: one more letter still lands in the box', inBox());
    ok('…and the box still holds what was typed', r.query('#q')[0].raw.includes('value="parse"'));

    const chip = r.query('[data-role="tool"]')[0];
    chip.focus();
    chip.fire('click');
    ok('a chip pressed from the keyboard comes back under the keyboard',
        doc.activeElement && doc.activeElement.dataset.role === 'tool');
}

// ---------- U-42: the kind chips are badges, and a badge toggles ----------
{
    const r = page();
    const html = r.html();
    ok('all six kinds are offered, delegation among them',
        ['user', 'assistant', 'delegator', 'handler', 'tool', 'toolResult']
            .every(id => html.includes(`data-role="${id}"`)));
    ok('Conversation is the default and visibly selected',
        /class="chip on"[\s\S]*data-preset="dialog"[\s\S]*aria-pressed="true"/.test(html));
    ok('canonical compact role names stay on the badges; detail stays in the tooltip',
        ['>🤖 Agent<', '>📤 Delegator<', '>📥 Handler<', '>🔧 Tools<', '>📄 Results<']
            .every(s => html.includes(s)) && !html.includes('>🤖 Agent replies<'));
    ok('quick scopes are visually a separate group, not more role badges in one run',
        html.includes('class="preset-group"') && html.includes('Quick scope')
        && html.includes('data-tone="preset"'));
    ok('…and the two extra sources are chips now, not checkboxes',
        html.includes('data-source="memory"') && html.includes('data-source="events"')
        && !html.includes('id="srcmem"'));
    ok('‼️ the row no longer repeats itself in words at its end',
        !html.includes('→ the conversation'));

    go(r);
    ok('a search carries the dialog kinds',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","automation","user"]');

    // ‼️ THE FIX U-42 ASKED FOR: two kinds at once, by the obvious gesture.
    r.query('[data-role="tool"]')[0].fire('click');
    ok('‼️ a plain click ADDS a kind — two are searchable at once',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","automation","tool","user"]');
    r.query('[data-role="tool"]')[0].fire('click');
    ok('…and clicking it again takes it away',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","automation","user"]');
    r.query('[data-role="user"]')[0].fire('click', { ctrlKey: true });
    ok('…Ctrl/⌘-click still means ONLY that one',
        JSON.stringify(lastSearch(r).roles) === '["user"]');
    // ‼️ U-88 — AND "ONLY" NOW REACHES ALL NINE CHIPS. It used to stop at the
    // role axis, so "only what a person wrote" quietly also searched every
    // memory note and orphaned event — two sources the reader had just
    // watched themselves NOT choose.
    ok('‼️ …and "only" means only: the two sources go out with the other roles',
        lastSearch(r).memory === false && lastSearch(r).events === false);
    r.query('[data-role="user"]')[0].fire('click');
    ok('…and the scope can never empty into "matches nothing"',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","automation","user"]');
    r.query('[data-preset="all"]')[0].fire('click');
    r.query('[data-source="memory"]')[0].fire('click', { ctrlKey: true });
    ok('‼️ a SOURCE can be the only thing chosen — the roles really do empty',
        JSON.stringify(lastSearch(r).roles) === '[]'
        && lastSearch(r).memory === true && lastSearch(r).events === false);
    ok('…and the page says so in words rather than reading as "everything"',
        r.html().includes('Memory') && !/Searching the conversation/.test(r.html()));
    // an empty role list on the wire is the CALLER's answer, so the engine must
    // not helpfully put the conversation back (the trap this item walked into)
    ok('‼️ …and the engine reads present-but-empty as none, not as the default',
        S.scanLimits({ roles: [] }).roles.size === 0
        && S.scanLimits({}).roles.size === 3);
    r.query('[data-source="memory"]')[0].fire('click');
    ok('…putting the last lit chip out falls back rather than searching nothing',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","automation","user"]');
    // back to the opening scope, so what follows measures the presets and the
    // plain source toggle rather than what "only this" left behind
    r.els['reset-scope'].fire('click');
    ok('Reset puts all nine chips back where they started',
        lastSearch(r).memory === true && lastSearch(r).events === true
        && JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","automation","user"]');
    // ‼️ S-36 — the one press that means "only what a person actually wrote".
    r.query('[data-preset="human"]')[0].fire('click');
    ok('the People-only preset drops the generated prompts',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["assistant","user"]');
    r.query('[data-preset="delegation"]')[0].fire('click');
    ok('the Delegation preset is one press',
        JSON.stringify(lastSearch(r).roles.slice().sort()) === '["delegator","handler"]');
    r.query('[data-preset="all"]')[0].fire('click');
    ok('…and Everything is all seven', lastSearch(r).roles.length === 7);
    r.query('[data-source="events"]')[0].fire('click');
    ok('a source chip toggles the source', lastSearch(r).events === false && lastSearch(r).memory === true);

    // ‼️ U-88 — THE SAME GESTURE, BEHIND A DOOR SOMEBODY LOOKING FOR IT WILL
    // TRY. Ctrl-click has meant "only this" since the chips became toggles and
    // is discoverable only by reading the hint; the right-click item is the
    // second door and runs the identical page function.
    const chips = () => r.contexts().filter(c => c.webviewSection === 'afScopeChip');
    ok('every scope chip publishes itself for the menu — the seven roles and both sources',
        chips().length === 9);
    ok('…carrying which axis it is on and which chip it is',
        chips().filter(c => c.scopeKind === 'role').length === 7
        && chips().filter(c => c.scopeKind === 'source').length === 2
        && chips().some(c => c.scopeId === 'toolResult' && c.scopeLabel === 'Results'));
    r.send({ type: 'afctx', act: 'scOnly', ctx: { scopeKind: 'role', scopeId: 'handler' } });
    ok('‼️ the menu item and the modifier are ONE path — same result, no second implementation',
        JSON.stringify(lastSearch(r).roles) === '["handler"]'
        && lastSearch(r).memory === false && lastSearch(r).events === false);
    ok('‼️ …and the chosen chip reports itself ALONE, which is what takes the item out of its own menu',
        chips().some(c => c.scopeId === 'handler' && c.scopeOn === true && c.scopeAlone === true)
        && chips().filter(c => c.scopeAlone === true).length === 1);
    ok('…while every other chip still offers it', chips().filter(c => c.scopeAlone === false).length === 8);
    r.send({ type: 'afctx', act: 'scOnly', ctx: { scopeKind: 'source', scopeId: 'events' } });
    ok('…and it works on a source chip too', JSON.stringify(lastSearch(r).roles) === '[]'
        && lastSearch(r).events === true && lastSearch(r).memory === false);
    const before = lastSearch(r);
    r.send({ type: 'afctx', act: 'somethingElse', ctx: {} });
    ok('an unrelated menu action is ignored rather than guessed at', lastSearch(r) === before);
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
    ok('the session lookup box owns the flexible column instead of becoming a slit',
        html.includes('grid-template-columns:minmax(420px,1fr)'));

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
    ok('clear filters remains beside the closed filter badge', r.html().includes('id="clear-filters"'));
    r.els['more-toggle'].fire('click');
    r.els['clear-filters'].fire('click');
    ok('clear filters works without reopening details and returns every axis',
        !r.html().includes('id="clear-filters"') && r.html().includes('⚙ Filters'));
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
        html.includes('class="scope-layout unavailable"') && html.includes('aria-disabled="true"'));
    go(r);
    ok('meaning reaches the host as its own mode and drops unsupported message dates',
        lastSearch(r).semantic === true && lastSearch(r).tsFrom === 0 && lastSearch(r).tsTo === 0);
}

// ---------- the query box: one line, no hover, and the caret stays in it ----------
{
    const r = page();
    const html = r.html();
    const qTag = (/<input id="q"[^>]*>/.exec(html) || [''])[0];
    ok('‼️ the query is ONE LINE at a fixed height, not a resizable textarea',
        !!qTag && !html.includes('<textarea id="q"')
        && html.includes('#q{box-sizing:border-box;width:100%;height:32px')
        && !html.includes('resize:vertical'));
    ok('‼️ …and it carries no hover of its own, native or rich',
        !/\btitle=/.test(qTag) && !html.includes('query-tip'));
    ok('everything that hover knew is in the syntax card instead', (() => {
        r.els['guide-toggle'].fire('click');
        const g = r.html();
        return g.includes('What is searched.') && g.includes('ten seconds')
            && g.includes('indexed main-session conversation only')
            && g.includes('▣ Whole word');
    })());
    ok('selected content carries fill class, check mark and aria state together',
        /class="chip on"[\s\S]*data-role="user"[\s\S]*aria-pressed="true"[^>]*>[\s\S]*chip-check[^>]*>✓/.test(html));
    ok('the check mark keeps its width in both states, so a press cannot resize a badge',
        html.includes('.chip-check{display:inline-block;width:12px')
        && !html.includes('font-weight:600'));
    ok('the Filters chip is wide enough for its own count, so gaining one shifts nothing',
        html.includes('#more-toggle{min-width:104px}'));
    ok('direct session-id lookup is a visible first-class action', html.includes('id="find-session"'));
    r.els['find-session'].fire('click');
    ok('…and it invokes the whole-index finder with the current text as its seed',
        r.last().type === 'findSession' && r.last().q === 'parser');
}

// ---------- ‼️ the two clearers each answer for the block they sit in ----------
{
    const r = page();
    go(r);
    ok('nothing to clear, and neither ✕ is drawn — but both slots hold their width',
        !r.html().includes('id="reset-scope"') && !r.html().includes('id="clear-filters"')
        && r.html().includes('class="act-slot"'));

    // the CONTENT scope: its ✕ lives in the content-scope row
    r.query('[data-role="tool"]')[0].fire('click');
    ok('a changed content scope lights the reset inside the scope row',
        /class="scope-actions">[\s\S]*id="reset-scope"/.test(r.html()));
    ok('‼️ …and a session filter does NOT light it — it is not that block',
        (() => {
            r.query('#more-toggle')[0].fire('click');
            r.query('[data-origin="auto"]')[0].fire('click');
            const h = r.html();
            return h.includes('id="clear-filters"')
                && /class="scope-actions">[\s\S]*id="reset-scope"/.test(h);
        })());
    ok('the filter clearer sits beside the Filters chip, not across the panel from it',
        /id="more-toggle"[\s\S]{0,600}id="clear-filters"/.test(r.html())
        && !/class="scope-actions">[\s\S]*id="clear-filters"/.test(r.html()));

    // …and pressing it puts back ONLY the content scope
    r.query('#reset-scope')[0].fire('click');
    const h = r.html();
    ok('reset returns Conversation and both extra sources',
        !h.includes('id="reset-scope"')
        && /data-preset="dialog"[\s\S]*aria-pressed="true"/.test(h)
        && /data-source="memory"[\s\S]*aria-pressed="true"/.test(h)
        && /data-source="events"[\s\S]*aria-pressed="true"/.test(h));
    ok('‼️ …and leaves the session filters exactly where they were',
        lastSearch(r).filters.origin === 'auto' && h.includes('id="clear-filters"'));
    r.query('#clear-filters')[0].fire('click');
    ok('the filter ✕ returns every session axis', lastSearch(r).filters.origin === ''
        && !r.html().includes('id="clear-filters"'));
}

// ---------- a surface toggle is not a change of question ----------
{
    const r = page();
    go(r);
    r.send({ type: 'results', seq: lastSearch(r).seq, result: fixture.RESULT });
    const stale = () => r.html().includes('The search definition changed');
    r.query('#guide-toggle')[0].fire('click');
    ok('‼️ opening the syntax card does not mark the answer on screen stale', !stale());
    r.query('#more-toggle')[0].fire('click');
    ok('…nor does opening the filter panel', !stale());
    r.query('#f-sort')[0].fire('change', { target: { value: 'hits' } });
    ok('…and sorting is done here, over hits the page already has',
        !stale() && lastSearch(r).seq === 1);

    // Case and Whole word ARE the question, so they re-ask it rather than
    // telling the reader to press a button the page could have pressed.
    const before = lastSearch(r).seq;
    r.query('[data-query-option="case"]')[0].fire('click');
    ok('‼️ Aa Case re-runs the search instead of raising a note',
        lastSearch(r).seq > before && lastSearch(r).caseSensitive === true && !stale());
}

// ---------- results: engines, delegation, the id banner ----------
{
    const r = runPage('search.js', fixture.data());
    const v = fixture.variants().find(x => x.id === 'results');
    v.act(r);
    const out = r.els.out.innerHTML;
    ok('every engine is badged in the results, not just the default one',
        ['Claude', 'Codex', 'Gemini', 'Antigravity'].every(e => out.includes(`>${e}<`)));
    ok('a delegation hit keeps the Delegator term', out.includes('>delegator<'));
    ok('a handler hit keeps the Handler term', out.includes('>handler<'));
    ok('the summary separates found matches from shown previews',
        out.includes('<b>13</b>matches') && out.includes('<b>10</b>previews'));
    // ‼️ U-63 — the fixture now holds the row that was reported as a duplicate.
    // A group must be identifiable WITHOUT opening it: short id, author glyph.
    ok('a session group carries its own short id, not just an engine and a name',
        out.includes('>#4d361981') && out.includes('>#019f79a0'));
    ok('…and an imported copy carries the import mark and an unverified author',
        out.includes('⇄') && out.includes('Imported — author unverified'));
    // ‼️ S-36 — a generated prompt is not the word "You".
    ok('a generated prompt is signed by the mechanism that wrote it',
        out.includes('Mission prompt · dashboard-Missions') && !out.includes('>you · dashboard'));
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
