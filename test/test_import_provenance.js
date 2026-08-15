// X-44 / U-63 / S-36 — producer vs. storage vs. provenance; one run counted
// once; and a generated prompt is not a person talking.
//
// The case these three came out of is real and is reproduced here in miniature:
// Agent Farm launched a headless `claude -p` mission, Codex Desktop later
// converted that transcript into its own rollout format, and the extension read
// the folder as the engine. One 13-minute $12.47 Claude mission was therefore
// shown as a 13-millisecond $0 user-typed Codex chat, counted a second time
// beside its own source, and titled by the mission TEMPLATE — so three
// different missions arrived as three identical-looking rows.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) h(v); }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: { showInformationMessage: () => Promise.resolve(undefined), showWarningMessage: () => Promise.resolve(undefined) },
    commands: { executeCommand: () => Promise.resolve(undefined) },
    Disposable: class { dispose() { } }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};
const out = (f) => require(path.resolve(__dirname, '../out/core/' + f));
const IMP = out('externalImports.js');
const AUTH = out('authorship.js');
const S = out('sessions.js');
const CLI = out('cliTranscripts.js');
const SEARCH = out('search.js');
const VIEWER = out('cliViewer.js');
const { PricingEngine } = out('pricing.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const ok = (n, cond) => eq(n, !!cond, true);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-import-'));
const codexHome = path.join(root, '.codex');
const claudeDir = path.join(root, '.claude');
const projSlug = path.join(claudeDir, 'projects', 'D--work-repo');
fs.mkdirSync(projSlug, { recursive: true });
fs.mkdirSync(path.join(codexHome, 'sessions', '2026', '07', '19'), { recursive: true });

const T0 = Date.parse('2026-07-17T10:00:00.000Z');
const IMPORT_TS = Date.parse('2026-07-19T09:06:31.892Z');

const MISSION = (goal) => `You are the LEAD of a mission. You do not do the work yourself — you plan, delegate to your team round by round, judge their results, and finish with an honest summary.

## Mission
${goal}

## Team
- basit (worker) — mechanical work

## Budget
$20 left.

## How to answer
Answer with JSON.`;

const GOAL_A = 'dashboard içinde search yanında Missions butonu çıkıyorsa diğer sayfalarda da çıksın';
const GOAL_B = 'kısa bir hikaye yaz';
const GOAL_C = 'şiir yaz';

// ---------------------------------------------------------------- the fixtures

/** A Claude transcript of a headless mission run Agent Farm launched. */
function claudeMission(id, goal, startTs, minutes) {
    const line = (o) => JSON.stringify(o);
    const at = (m) => new Date(startTs + m * 60000).toISOString();
    return [
        // ‼️ `entrypoint: sdk-cli` is the real fixture's own value: Agent Farm
        // launched this with `claude -p`, and it is the fact `sessionOrigin`
        // reads. The transcript still calls the channel `user` (S-36).
        line({ type: 'user', sessionId: id, cwd: 'D:\\work\\repo', version: '2.1.220', userType: 'external',
            entrypoint: 'sdk-cli', timestamp: at(0), message: { role: 'user', content: MISSION(goal) } }),
        line({ type: 'assistant', sessionId: id, timestamp: at(1), message: { role: 'assistant',
            model: 'claude-opus-4-1', content: [{ type: 'text', text: 'Planning the mission. baş' }],
            usage: { input_tokens: 1000, output_tokens: 500 } } }),
        line({ type: 'user', sessionId: id, timestamp: at(minutes - 1),
            message: { role: 'user', content: 'devam et, baş tarafı bitir' } }),
        line({ type: 'assistant', sessionId: id, timestamp: at(minutes), message: { role: 'assistant',
            model: 'claude-opus-4-1', content: [{ type: 'text', text: 'Done.' }],
            usage: { input_tokens: 900, output_tokens: 300 } } })
    ].join('\n') + '\n';
}

/**
 * The Codex Desktop conversion of that transcript. Everything carries the
 * IMPORT's timestamp — which is why the row read 13 ms — and the same message
 * appears both as an `event_msg` and as a `response_item`, which is the raw
 * duplicate U-63(f) is about.
 */
function codexImport(threadId, goal, marked) {
    const t = new Date(IMPORT_TS).toISOString();
    const L = [
        JSON.stringify({ timestamp: t, type: 'session_meta', payload: { session_id: threadId, id: threadId,
            cwd: 'D:\\work\\repo', originator: 'Codex Desktop', cli_version: '0.145.0-alpha.18' } })
    ];
    if (marked) {
        L.push(JSON.stringify({ timestamp: t, type: 'event_msg', payload: { type: 'task_started',
            turn_id: 'external-import-turn-1', started_at: 1784272995 } }));
    }
    L.push(JSON.stringify({ timestamp: t, type: 'event_msg', payload: { type: 'user_message', message: MISSION(goal) } }));
    L.push(JSON.stringify({ timestamp: t, type: 'response_item', payload: { type: 'message', role: 'user',
        content: [{ type: 'input_text', text: MISSION(goal) }] } }));
    L.push(JSON.stringify({ timestamp: t, type: 'event_msg', payload: { type: 'agent_message', message: 'Planning the mission. baş' } }));
    L.push(JSON.stringify({ timestamp: t, type: 'response_item', payload: { type: 'message', role: 'assistant',
        content: [{ type: 'output_text', text: 'Planning the mission. baş' }] } }));
    L.push(JSON.stringify({ timestamp: t, type: 'event_msg', payload: { type: 'token_count',
        info: { model: 'gpt-5', total_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
            last_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 }, model_context_window: 258400 } } }));
    return L.join('\n') + '\n';
}

const SRC = { a: 'f180e6db-b923-4f3f-aa7b-7cca3018ccdb', b: 'aaa11111-0000-4000-8000-000000000001', c: 'bbb22222-0000-4000-8000-000000000002' };
const THREAD = { a: '019f79a0-75bf-7e33-a6d2-a2ac7f4b850d', b: '019f79a0-4de7-7000-0000-000000000001', c: '019f79a0-4e70-7000-0000-000000000002' };

fs.writeFileSync(path.join(projSlug, SRC.a + '.jsonl'), claudeMission(SRC.a, GOAL_A, T0, 14), 'utf8');
fs.writeFileSync(path.join(projSlug, SRC.b + '.jsonl'), claudeMission(SRC.b, GOAL_B, T0 + 3600e3, 5), 'utf8');
fs.writeFileSync(path.join(projSlug, SRC.c + '.jsonl'), claudeMission(SRC.c, GOAL_C, T0 + 7200e3, 6), 'utf8');

const roll = (thread) => path.join(codexHome, 'sessions', '2026', '07', '19',
    `rollout-2026-07-19T16-06-26-${thread}.jsonl`);
fs.writeFileSync(roll(THREAD.a), codexImport(THREAD.a, GOAL_A, true), 'utf8');
fs.writeFileSync(roll(THREAD.b), codexImport(THREAD.b, GOAL_B, true), 'utf8');
fs.writeFileSync(roll(THREAD.c), codexImport(THREAD.c, GOAL_C, true), 'utf8');

// A native Codex thread that nobody imported, and an import nothing explains.
const NATIVE = '019f7b00-0000-7000-8000-00000000aaaa';
const ORPHAN = '019f7b00-0000-7000-8000-00000000bbbb';
fs.writeFileSync(roll(NATIVE), codexImport(NATIVE, 'gerçek codex işi', false), 'utf8');
fs.writeFileSync(roll(ORPHAN), codexImport(ORPHAN, 'kaynağı bilinmeyen iş', true), 'utf8');

const manifest = {
    records: [
        { source_path: '\\\\?\\' + path.join(projSlug, SRC.a + '.jsonl'), content_sha256: 'a'.repeat(64),
            imported_thread_id: THREAD.a, imported_at: Math.floor(IMPORT_TS / 1000), source_modified_at: T0 * 1e6, connector_names: [] },
        { source_path: '\\\\?\\' + path.join(projSlug, SRC.b + '.jsonl'), content_sha256: 'b'.repeat(64),
            imported_thread_id: THREAD.b, imported_at: Math.floor(IMPORT_TS / 1000), connector_names: [] },
        { source_path: '\\\\?\\' + path.join(projSlug, SRC.c + '.jsonl'), content_sha256: 'c'.repeat(64),
            imported_thread_id: THREAD.c, imported_at: Math.floor(IMPORT_TS / 1000), connector_names: [] },
        // A malformed record must not take the good ones down with it.
        { source_path: '', imported_thread_id: '' }
    ]
};
const manifestFile = IMP.importManifestPath(codexHome);
fs.writeFileSync(manifestFile, JSON.stringify(manifest), 'utf8');

// ------------------------------------------------------------- the manifest

{
    const m = IMP.parseImportManifest(fs.readFileSync(manifestFile, 'utf8'), manifestFile);
    eq('manifest: malformed records are skipped, not fatal', m.records, 3);
    eq('manifest: \\\\?\\ long-path prefix is stripped',
        m.byThread.get(THREAD.a).sourcePath, path.join(projSlug, SRC.a + '.jsonl'));
    eq('manifest: the source file name IS the claude session id',
        m.byThread.get(THREAD.a).sourceSessionId, SRC.a);
    eq('manifest: seconds normalize to ms', m.byThread.get(THREAD.a).importedAt, IMPORT_TS - 892);
    eq('manifest: nanoseconds normalize to ms', m.byThread.get(THREAD.a).sourceModifiedAt, T0);
    eq('manifest: the producer is read off the path shape',
        m.byThread.get(THREAD.a).producerEngine, 'claude');
    ok('‼️ a broken manifest is BROKEN, never half-believed',
        IMP.parseImportManifest('{oh dear', 'x').broken === true
        && IMP.parseImportManifest('{oh dear', 'x').records === 0);
    eq('an unknown path shape names no producer',
        IMP.producerEngineOfSourcePath('D:\\somewhere\\else\\thing.txt'), undefined);
}

// --------------------------------------------------- the codex source, parsed

const pricing = new PricingEngine([]);
const src = CLI.codexSessionsSource(() => codexHome, () => ({ agentId: 'dev', agentName: 'developer' }),
    () => pricing, 0);
const scanned = src.scan();
const byId = new Map(scanned.map(s => [s.sessionId, s]));

{
    const a = byId.get(THREAD.a);
    eq('‼️ X-44 the import is not a native codex session', a.provenance, 'imported');
    eq('…the engine that DID the work is claude', S.producerEngineOf(a), 'claude');
    eq('…the format on disk is still codex', S.storageEngineOf(a), 'codex');
    eq('…and the canonical id is the SOURCE run, not the copy', a.canonicalSessionId, SRC.a);
    eq('…while `sessionId` still addresses the file on disk (resume/open)', a.sessionId, THREAD.a);
    eq('…the import time is recorded as the import time', a.importedAt, IMPORT_TS - 892);

    const n = byId.get(NATIVE);
    eq('a native codex thread stays native', [n.provenance, S.producerEngineOf(n)], ['native', 'codex']);
    eq('…and is its own canonical run', n.canonicalSessionId, NATIVE);

    const o = byId.get(ORPHAN);
    eq('‼️ marked as a copy, source unnamed → no producer is INVENTED',
        [o.provenance, S.producerEngineOf(o)], ['imported-unknown-source', 'unknown']);
    ok('…and the note says so out loud in one sentence',
        /source is not named/.test(S.provenanceNote(o)));
    ok('a native session gets no provenance note at all', S.provenanceNote(n) === undefined);
}

// ---------------------------------- S-36: the title is the goal, not the wrapper

{
    eq('‼️ S-36 three missions, three titles — not one template three times',
        [byId.get(THREAD.a).title.slice(0, 40), byId.get(THREAD.b).title, byId.get(THREAD.c).title],
        [GOAL_A.slice(0, 40), GOAL_B, GOAL_C]);
    eq('…and three DIFFERENT titles, which is the whole complaint',
        new Set(scanned.map(s => s.title)).size, scanned.length);
    ok('…and none of them is the wrapper\'s own first line',
        !scanned.some(s => /You are the LEAD/.test(s.title)));
    eq('an unrecognized prompt is left alone rather than parsed speculatively',
        AUTH.wrapperGoal('just an ordinary sentence about missions'), undefined);
    eq('a recognized wrapper with an empty section yields no goal',
        AUTH.wrapperGoal('You are the LEAD of a mission. x\n\n## Mission\n\n## Team\n- a'), undefined);
    eq('…but is still recognized AS a wrapper, so a launcher name can name it',
        AUTH.isGeneratedPrompt('You are the LEAD of a mission. x\n\n## Mission\n\n## Team\n- a'), true);
}

// ------------------------------------------------- S-36: who wrote the prompt

{
    const label = (f) => AUTH.userAuthorOf(f);
    eq('a person at a keyboard is You', label({ origin: 'user' }).label, 'You');
    eq('a mission run is a Mission prompt, by name',
        [label({ origin: 'auto', launchedBy: { kind: 'mission', label: 'dashboard işi' } }).label,
        label({ origin: 'auto', launchedBy: { kind: 'mission', label: 'dashboard işi' } }).launcher],
        ['Mission prompt', 'dashboard işi']);
    eq('a task run says task', label({ origin: 'auto', launchedBy: { kind: 'task', label: 't' } }).label, 'Task prompt');
    eq('a schedule says schedule', label({ origin: 'auto', launchedBy: { kind: 'schedule', label: 's' } }).label, 'Schedule prompt');
    eq('a trigger says trigger', label({ origin: 'auto', launchedBy: { kind: 'trigger', label: 'x' } }).label, 'Trigger prompt');
    eq('‼️ sdk-* with no launcher on record is honest about not knowing which program',
        label({ origin: 'auto' }).label, 'Automation prompt');
    eq('‼️ an unresolvable import claims NEITHER author',
        [label({ origin: 'user', provenance: 'imported-unknown-source' }).author,
        label({ origin: 'user', provenance: 'imported-unknown-source' }).label],
        ['unknown', 'Imported — author unverified']);
    // The Console exception is already inside sessionOrigin; this is the proof
    // that it survives the new axis rather than being re-decided here.
    eq('a Console-hosted sdk session is a person, so it stays You',
        label({ origin: S.sessionOrigin({ entrypoint: 'sdk-cli', consoleHosted: true }) }).label, 'You');
    eq('…and a launcher still outranks the Console (S-31/S-35 order kept)',
        S.sessionOrigin({ entrypoint: 'sdk-cli', consoleHosted: true, launchedBy: { kind: 'mission', label: 'm' } }), 'auto');
}

// ------------------------------------- X-44: one run, one row (the index side)

const index = new S.SessionIndex(claudeDir, () => [], pricing,
    () => [{ id: 'dev', name: 'developer', dir: path.join(root, 'agents', 'developer'), cwd: 'D:\\work\\repo' }],
    () => true, () => 150000);

(async () => {
    await index.scanAll();
    const claudeIds = index.all().map(s => s.sessionId).sort();
    eq('the three source transcripts are in the claude pool', claudeIds, [SRC.b, SRC.c, SRC.a].sort());

    index.setExternal(scanned.slice());
    const visible = index.external().map(s => s.sessionId).sort();
    eq('‼️ X-44 the imported copies leave the counted pool',
        visible, [NATIVE, ORPHAN].sort());
    eq('…and are kept aside rather than deleted',
        index.externalImportAliases().map(s => s.sessionId).sort(), [THREAD.a, THREAD.b, THREAD.c].sort());
    ok('…so resuming / opening the codex thread still resolves',
        index.byId(THREAD.a) && index.byId(THREAD.a).sessionId === THREAD.a
        && index.byFile(roll(THREAD.a)) !== undefined);
    eq('…the alias points at the run it is a copy of', index.byId(THREAD.a).aliasOf, SRC.a);
    eq('…and the run knows a copy exists', index.byId(SRC.a).importAliases, [THREAD.a]);

    // ‼️ The figures on the alias are the RUN's, not the copy's 13 ms and $0.
    const run = index.byId(SRC.a), alias = index.byId(THREAD.a);
    eq('the alias inherits the run\'s real time span', [alias.firstTs, alias.lastTs], [run.firstTs, run.lastTs]);
    ok('…which is a real duration, not the millisecond the copy was written',
        alias.lastTs - alias.firstTs > 10 * 60 * 1000);
    eq('the alias inherits the run\'s cost and tokens', [alias.cost, alias.wTokens], [run.cost, run.wTokens]);
    eq('the alias inherits the run\'s entrypoint, so origin agrees with the source',
        S.sessionOrigin(alias), S.sessionOrigin(run));

    eq('‼️ allWithExternal counts the work ONCE',
        index.allWithExternal().filter(s => S.canonicalSessionKey(s) === SRC.a).length, 1);
    eq('the native codex thread is untouched by any of this',
        index.external().find(s => s.sessionId === NATIVE).provenance, 'native');
    eq('…and an unresolvable import stays VISIBLE with its own data',
        index.external().find(s => s.sessionId === ORPHAN).aliasOf, undefined);

    // The source arriving LATER is the ordinary case on a real machine: the
    // manifest is written before the projects folder is rescanned.
    const late = new S.SessionIndex(path.join(root, 'empty-claude'), () => [], pricing,
        () => [{ id: 'dev', name: 'developer', dir: path.join(root, 'agents', 'developer'), cwd: 'D:\\work\\repo' }],
        () => true, () => 150000);
    late.setExternal(scanned.slice());
    eq('‼️ with no source in the index the import is kept and counted — never hidden',
        late.external().map(s => s.sessionId).sort(), scanned.map(s => s.sessionId).sort());
    eq('…and still says it is a copy of something', late.byId(THREAD.a).provenance, 'imported');
    late.dispose();

    // ------------------------------------------------ U-63: search, once each
    const searchable = (list) => list.map(s => {
        const a = AUTH.userAuthorOf({ origin: S.sessionOrigin(s), launchedBy: s.launchedBy, provenance: s.provenance });
        return {
            file: s.file, agentName: s.agentName, title: s.title, mtime: s.mtime, sessionId: s.sessionId,
            engine: s.source || 'claude', isSidechain: s.isSidechain,
            author: a.author, authorLabel: a.label, launcher: a.launcher,
            provenance: s.provenance, producer: S.producerEngineOf(s),
            canonicalSessionId: S.canonicalSessionKey(s)
        };
    });
    const parseForeign = (raw, f) => {
        const p = VIEWER.parseCliViewer(raw, f, pricing);
        return p ? { messages: p.messages, turns: p.turns } : undefined;
    };

    const pool = searchable(index.allWithExternal());
    const rAll = SEARCH.searchTranscripts(pool, 'baş', { roles: SEARCH.ALL_ROLES, maxPerFile: 50, parseForeign });
    const groups = new Set(rAll.hits.map(h => h.file));
    eq('‼️ U-63 the source and its copy are ONE group, not two',
        groups.size, rAll.sessionMatches.length);
    const aliasFiles = new Set(index.externalImportAliases().map(s => s.file));
    ok('…and no imported alias is scanned at all',
        aliasFiles.size === 3 && ![...groups].some(f => aliasFiles.has(f)));
    eq('…the three missions are three distinct sessions with three distinct titles',
        new Set(rAll.hits.filter(h => h.engine === 'claude').map(h => h.title)).size, 3);

    // (d) the same word in two different turns of one session is two hits.
    const one = pool.filter(s => s.sessionId === SRC.a);
    const rOne = SEARCH.searchTranscripts(one, 'baş', { roles: SEARCH.ALL_ROLES, maxPerFile: 50, parseForeign });
    ok('‼️ two real turns saying the same word stay TWO hits', rOne.matchesFound >= 2);
    eq('…and they are in different turns',
        new Set(rOne.hits.map(h => h.turn)).size >= 2, true);

    // (e) the same record handed to the reducer twice is one hit.
    const rec = { role: 'user', text: 'baş tarafı bitir', ts: T0, turn: 1, turnLabel: 'x' };
    const dbl = SEARCH.emptyResult();
    SEARCH.scanSession([rec, { ...rec }], one[0], SEARCH.buildMatcher('baş', {}),
        SEARCH.scanLimits({ roles: SEARCH.ALL_ROLES }), dbl);
    eq('‼️ the same record twice is ONE hit', [dbl.matchesFound, dbl.hits.length], [1, 1]);

    // (f) the raw import states the user message twice; the parser yields one.
    const parsed = VIEWER.parseCliViewer(fs.readFileSync(roll(THREAD.a), 'utf8'), roll(THREAD.a), pricing);
    eq('‼️ event_msg + response_item twins are ONE user message',
        parsed.messages.filter(m => m.role === 'user').length, 1);
    eq('…and the assistant twins are one message too',
        parsed.messages.filter(m => m.role === 'assistant').length, 1);

    // ------------------------------- S-36: the You filter really means a person
    const rHuman = SEARCH.searchTranscripts(pool, 'baş', { roles: ['user'], maxPerFile: 50, parseForeign });
    eq('‼️ S-36 `roles:["user"]` finds nothing a program wrote', rHuman.matchesFound, 0);
    const rAuto = SEARCH.searchTranscripts(pool, 'baş', { roles: ['automation'], maxPerFile: 50, parseForeign });
    ok('…and the Automation filter finds exactly those prompts', rAuto.matchesFound > 0);
    ok('…each carrying the label a surface prints instead of "You"',
        rAuto.hits.every(h => h.author === 'automation' && h.authorLabel === 'Automation prompt'));
    eq('…the counters are consistent after the split',
        rAuto.matchesShown <= rAuto.matchesFound && rAuto.omittedMatches === rAuto.matchesFound - rAuto.matchesShown, true);
    ok('…and the turn deep-link survives it',
        rAuto.hits.every(h => typeof h.turn === 'number' && h.file));

    // A person's own session is untouched by all of it.
    const human = { file: one[0].file, title: 't', mtime: Date.now(), sessionId: 'x', engine: 'claude', author: 'human' };
    eq('a person\'s prompt is still `user` and still found by the You filter',
        SEARCH.displayRole('user', human), 'user');
    eq('…while the same record in an automated session reads as automation',
        SEARCH.displayRole('user', { author: 'automation' }), 'automation');
    eq('…and an unverifiable import is not quietly filed under You either',
        SEARCH.displayRole('user', { author: 'unknown' }), 'automation');
    eq('nothing else on the role axis moves',
        ['assistant', 'delegator', 'handler', 'tool', 'toolResult']
            .map(r => SEARCH.displayRole(r, { author: 'automation' })),
        ['assistant', 'delegator', 'handler', 'tool', 'toolResult']);
    eq('‼️ `automation` is STORED as `user` — a shard by that name never existed',
        SEARCH.storedRoles(['automation', 'user', 'assistant']), ['user', 'assistant']);

    // ------------------------------------------- the pool is unique on the RUN
    const twinned = [...pool, ...searchable(index.externalImportAliases())];
    eq('‼️ U-63 the scan pool is unique on the canonical run, not on the path',
        SEARCH.orderSessions(twinned, {}).length, pool.length);
    // Two genuinely independent sessions that merely look alike are NOT merged.
    eq('…but two different runs stay two, however similar they look',
        SEARCH.orderSessions([
            { file: 'a', title: 'same', mtime: 2, sessionId: 'id-1', canonicalSessionId: 'id-1' },
            { file: 'b', title: 'same', mtime: 1, sessionId: 'id-2', canonicalSessionId: 'id-2' }
        ], {}).length, 2);

    index.dispose();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* windows lock */ }
    console.log(`\n${pass} passed, ${fail} failed`);
    Module._load = origLoad;
    process.exit(fail ? 1 : 0);
})();
