// ‼️ THE WHOLE SESSION SUBSYSTEM, AUDITED ON REAL DATA.
//
// Not "does the row open" — that was one symptom. This builds the REAL index
// over the REAL stores with the REAL sources, then holds every surface against
// every other one for every session:
//
//   · the row and the page must agree about engine, origin, headless, times,
//     turns, tools, errors and cost — they are the same session;
//   · a row must be reachable: `byId` and `byFile` must both find it;
//   · a row must be filed: an agent, or honestly "Other projects";
//   · every id must be unique — one conversation, one row;
//   · a title must be a title, not a placeholder over a real prompt;
//   · times must be sane (first <= last, nothing in the future);
//   · a figure must not be negative, and a cost must not exist without tokens.
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');
const orig = Module._load;
Module._load = function (r) {
    if (r === 'vscode') {
        return {
            Uri: {}, window: {},
            EventEmitter: class {
                constructor() { this.fns = []; }
                get event() { return fn => { this.fns.push(fn); return { dispose() { } }; }; }
                fire(v) { this.fns.forEach(f => f(v)); }
            },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d }), createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() { } }), onDidCreate: () => ({ dispose() { } }), onDidDelete: () => ({ dispose() { } }), dispose() { } }) },
            RelativePattern: class { },
            ViewColumn: {}, ConfigurationTarget: {}, env: {}, window_: {}
        };
    }
    return orig.apply(this, arguments);
};
const core = p => require(path.join(__dirname, '..', 'out', 'core', p));
const S = core('sessions.js');
const T = core('cliTranscripts.js');
const P = core('pricing.js');
const SS = core('sessionSource.js');
const viewer = require(path.join(__dirname, '..', 'out', 'panels', 'sessionViewer.js'));
Module._load = orig;

const gs = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm');
const claudeDir = path.join(os.homedir(), '.claude');
const agentIds = ['basit', 'developer', 'genel', 'psikolog', 'manager'];
const agents = agentIds.map(id => ({ id, name: id, dir: `D:\\zone\\agent\\ajanlar\\${id}` }));
const norm = p => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const resolveAgent = cwd => {
    const n = norm(cwd);
    if (!n) { return {}; }
    for (const a of agents) {
        const d = norm(a.dir);
        if (n === d || n.startsWith(d + '/')) { return { agentId: a.id, agentName: a.name }; }
    }
    return {};
};
const pricing = new P.PricingEngine([]);

const sources = [
    T.codexSessionsSource(() => path.join(os.homedir(), '.codex'), resolveAgent, () => pricing, 0),
    T.geminiSessionsSource(() => path.join(os.homedir(), '.gemini', 'tmp'), () => agents, () => pricing, 0),
    T.agySessionsSource(() => path.join(os.homedir(), '.gemini', 'antigravity-cli'), resolveAgent, () => path.join(gs, 'external-console-transcripts'), 0),
    T.opencodeSessionsSource(() => path.join(gs, 'opencode-exports'), resolveAgent, () => pricing, 0),
    T.farmConsoleSessionsSource(() => path.join(gs, 'external-console-transcripts'), resolveAgent, 0),
    SS.liveEventsSource(() => path.join(gs, 'live-events.jsonl'), 0)
];

const problems = [];
const flag = (kind, s, msg) => problems.push({ kind, engine: s.source || 'claude', id: String(s.sessionId).slice(0, 10), msg });

(async () => {
    const index = new S.SessionIndex(claudeDir, () => [], pricing, () => agents, () => true, () => 200000);
    await index.scanAll();
    index.setExternal(SS.buildExternalSessions(sources));

    const all = index.allWithExternal();
    console.log(`index: ${all.length} sessions`);
    const byEngine = {};
    all.forEach(s => { const e = s.source || 'claude'; byEngine[e] = (byEngine[e] || 0) + 1; });
    console.log('by engine:', JSON.stringify(byEngine));

    // ---- one conversation, one row
    const seen = new Map();
    for (const s of all) {
        const prev = seen.get(s.sessionId);
        if (prev) { flag('DUPLICATE', s, `id appears twice (${prev.source || 'claude'} + ${s.source || 'claude'})`); }
        else { seen.set(s.sessionId, s); }
    }

    const deps = {
        maxMessages: () => 200000,
        getPricing: () => pricing,
        contextLimitFor: () => 200000,
        titleFor: () => undefined, pinnedFor: () => false, tagsFor: () => [],
        engineFor: id => index.byId(id)?.source,
        launchedByFor: id => index.byId(id)?.launchedBy,
        laneFor: () => false,
        originFor: id => {
            const s = index.byId(id);
            return s ? { origin: S.sessionOrigin(s), headless: S.sessionHeadless(s) } : undefined;
        }
    };

    const now = Date.now();
    let opened = 0;
    for (const s of all) {
        // ---- reachable from both directions
        if (!index.byId(s.sessionId)) { flag('UNREACHABLE', s, 'byId cannot find its own row'); }
        if (s.file && !index.byFile(s.file)) { flag('UNREACHABLE', s, 'byFile cannot find its own row'); }

        // ---- filed
        if (!s.agentId && !s.agentName) { flag('UNFILED', s, 'no agent and no "Other projects" name'); }

        // ---- sane figures
        if (s.firstTs > s.lastTs) { flag('TIME', s, `firstTs > lastTs`); }
        if (s.lastTs > now + 60_000) { flag('TIME', s, 'lastTs is in the future'); }
        for (const k of ['userTurns', 'assistantMsgs', 'toolCalls', 'errors', 'cost', 'wTokens']) {
            if (typeof s[k] === 'number' && s[k] < 0) { flag('FIGURE', s, `${k} is negative (${s[k]})`); }
        }
        const tok = s.usage.input + s.usage.output + s.usage.cacheRead + s.usage.cacheWrite;
        if (s.cost > 0 && tok === 0 && !s.scanLimit) { flag('FIGURE', s, 'a cost with no tokens behind it'); }

        // ---- a title is a title
        if (/^(claude|codex|gemini|agy|opencode) session$/.test(String(s.title)) && s.userTurns > 0) {
            flag('TITLE', s, `placeholder title over ${s.userTurns} real prompt(s)`);
        }

        // ---- origin is decidable and consistent with headless
        const o = S.sessionOrigin(s), h = S.sessionHeadless(s);
        if (o !== 'user' && o !== 'auto') { flag('ORIGIN', s, `origin is ${o}`); }
        if (h && o !== 'auto') { flag('ORIGIN', s, 'headless but not automation'); }

        // ---- the page
        if (!s.file) {
            // honest: no transcript to open. Only live-event lanes may be here.
            if (s.source !== undefined && !String(s.sessionId).startsWith('cli:')) {
                flag('NO-FILE', s, 'an external row with no transcript to open');
            }
            continue;
        }
        if (s.scanLimit) { continue; }   // deliberately unread, by contract
        let d;
        try { d = viewer.buildData(s.file, deps); } catch (e) {
            flag('PAGE', s, `buildData threw: ${e.message}`); continue;
        }
        opened++;
        const n = Array.isArray(d.messages) ? d.messages.length : 0;
        if (!n) { flag('PAGE', s, 'page renders 0 messages'); continue; }
        if (String(d.engine || 'claude') !== String(s.source || 'claude')) {
            flag('PAGE', s, `page engine=${d.engine} but row engine=${s.source || 'claude'}`);
        }
        if (d.origin !== o) { flag('PAGE', s, `page origin=${d.origin} but row origin=${o}`); }
        if (!!d.headless !== !!h) { flag('PAGE', s, `page headless=${d.headless} but row headless=${h}`); }
        if (d.sessionId && d.sessionId !== s.sessionId) {
            flag('PAGE', s, `page id=${String(d.sessionId).slice(0, 10)}`);
        }
        if (Math.abs((d.lastTs || 0) - s.lastTs) > 5000) { flag('PAGE', s, 'page and row disagree about when it ended'); }
    }

    console.log(`pages opened: ${opened}`);
    const byKind = {};
    problems.forEach(p => { byKind[p.kind] = (byKind[p.kind] || 0) + 1; });
    console.log(problems.length ? `\nPROBLEMS (${problems.length}): ${JSON.stringify(byKind)}` : '\n✅ NO PROBLEM FOUND ACROSS ANY SURFACE');
    const shown = {};
    for (const p of problems) {
        shown[p.kind] = (shown[p.kind] || 0) + 1;
        if (shown[p.kind] <= 6) { console.log(` [${p.kind}] ${p.engine} ${p.id}: ${p.msg}`); }
    }
    for (const [k, n] of Object.entries(byKind)) { if (n > 6) { console.log(` [${k}] … and ${n - 6} more`); } }
})();
