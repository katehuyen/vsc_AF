// B-9 — reports, exports and session diagnosis over the bridge
// (compiled core/reportBridge.js + the two builders that moved into report.js).
//
// Every document this extension produces existed only as a thing to LOOK at:
// the cost report opened an editor, the digest opened a save dialog, the OTLP
// export asked where to put it. What these prove is the delivery contract —
// content back by default, an atomic write when a path is given, the path
// always named, and nothing that spends money or speaks outward without being
// asked in so many words.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { registerReportOps, atomicWrite } =
    require(path.join(__dirname, '..', 'out', 'core', 'reportBridge.js'));
const { buildCostReport, buildTriggerReport } =
    require(path.join(__dirname, '..', 'out', 'core', 'report.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

const NOW = Date.parse('2026-08-14T12:00:00Z');
const DAY = 24 * 3600 * 1000;
const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

// ---------- the two builders that moved out of the command bodies ----------
{
    const session = (cost, tokens, agentName, title, ts) => ({
        file: 'f-' + title, title, agentName, cost, tokens, lastTs: ts,
        daily: { [dayKey(ts)]: { cost } }
    });
    // 14 quiet days, then a day that costs twenty times the median.
    const quiet = [];
    for (let i = 1; i <= 14; i++) { quiet.push(session(1, 1000, 'yazar', 'day' + i, NOW - i * DAY)); }
    const today = session(40, 900000, 'yazar', 'the expensive one', NOW);
    const md = buildCostReport({
        now: NOW, minUsd: 1, scopeNote: 'Only Claude sessions are priced.',
        fleet: [...quiet, today],
        perAgent: [{ name: 'yazar', sessions: [...quiet, today] }]
    });
    ok('buildCostReport heads the document and dates it', /# Agent Farm — Cost Anomaly Report/.test(md));
    ok('‼️ …and carries the scope sentence, so "fleet" is not a lie',
        /> \*\*Scope\.\*\* Only Claude sessions are priced\./.test(md));
    ok('…a day twenty times the median is flagged as an anomaly', /⚠ YES/.test(md));
    ok('…and the heavy hitters section names the session that did it',
        /Heavy hitters/.test(md) && /the expensive one/.test(md));

    const quietOnly = buildCostReport({
        now: NOW, minUsd: 1, scopeNote: '', fleet: quiet, perAgent: []
    });
    ok('…an ordinary day is not an anomaly', !/⚠ YES/.test(quietOnly));
    ok('…and with nothing to say about scope, nothing is said', !/Scope/.test(quietOnly));

    const trig = buildTriggerReport([
        { title: 'inbox watch', enabled: true, fireCountTotal: 12, ok7d: 5, fail7d: 0, medianStartDelayMs: 4000, lastFiredAt: NOW - 3600_000, neverFired: false, alwaysFails: false },
        { title: 'never used', enabled: true, fireCountTotal: 0, ok7d: 0, fail7d: 0, lastFiredAt: undefined, neverFired: true, alwaysFails: false },
        { title: 'broken', enabled: true, fireCountTotal: 9, ok7d: 0, fail7d: 4, medianStartDelayMs: 300_000, lastFiredAt: NOW - DAY, neverFired: false, alwaysFails: true }
    ], NOW);
    ok('buildTriggerReport draws a row per trigger', (trig.match(/\n\| /g) || []).length >= 5);
    ok('…a short delay reads in seconds, a long one in minutes',
        /\| 4s \|/.test(trig) && /\| 5m \|/.test(trig));
    ok('…and the two flags worth acting on are said in words',
        /never fired/.test(trig) && /⚠ always fails/.test(trig));
    ok('…while a trigger that has never fired says "never" rather than a date',
        /\| never \|/.test(trig));
}

// ---------- the ops ----------
(async () => {
    const root = fs.mkdtempSync(path.join(__dirname, 'tmp-report-'));
    const reportDir = path.join(root, 'reports');
    const relaySrc = path.join(root, 'build', 'farmRelay.js');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.mkdirSync(path.dirname(relaySrc), { recursive: true });
    fs.writeFileSync(relaySrc, '// relay\n');

    const agent = { id: 'a1', name: 'yazar', dir: path.join(root, 'yazar') };
    let triggers = 'TRIGGER-REPORT';
    let live = new Set();
    let captured = { ok: true, report: { tokens: 42000, categories: [{ name: 'System prompt', tokens: 3000 }] } };
    const sent = [];
    const schedules = [{ id: 's1', title: 'gece taramasi', agentName: 'yazar', agentId: 'a1' }];
    const reg = new BridgeRegistry();
    registerReportOps(reg, {
        getAgents: () => [agent],
        fleetReport: (days) => `# FLEET ${days}d`,
        outputsDigest: (ms) => `# OUTPUTS ${ms}`,
        costReport: () => '# COST',
        triggerReport: () => triggers || undefined,
        taskAnalytics: (days) => ({ days, runs: 17 }),
        instructionReport: (a) => `# INSTRUCTIONS ${a.name}`,
        otlp: (ms) => ({ resourceSpans: [{ window: ms }] }),
        schedules: () => schedules,
        scheduleExport: (s) => ({
            cmdFile: path.join(root, `af-${s.id}.cmd`), script: '@echo off\r\n',
            schtasks: `schtasks /Create /TN "AgentFarm\\${s.title}" /F`
        }),
        relayScriptSource: () => relaySrc,
        digestBody: () => 'today: 3 runs, 1 failure',
        sendDigest: () => sent.push('send'),
        speakDigest: () => sent.push('speak'),
        weeklySummary: async () => '# WEEKLY',
        findSession: (id) => id === 'sess-1'
            ? { sessionId: 'sess-1', file: path.join(root, 'sess-1.jsonl'), cwd: root, model: 'claude-opus-5', engine: 'claude', agentName: 'yazar', title: 'the session' }
            : id === 'sess-cx'
                ? { sessionId: 'sess-cx', file: path.join(root, 'sess-cx.jsonl'), cwd: root, engine: 'codex' }
                : undefined,
        isLive: (id) => live.has(id),
        captureContext: async () => captured,
        defaultReportDir: () => reportDir
    });

    // ---- the delivery contract, proved on one op and shared by all ----
    {
        const back = await reg.dispatch('reports.fleet', {});
        ok('a report comes back as CONTENT, with nothing written',
            back.ok && back.result.content === '# FLEET 7d' && back.result.file === null
            && fs.readdirSync(reportDir).length === 0);

        const target = path.join(root, 'sub', 'fleet.md');
        const written = await reg.dispatch('reports.fleet', { days: 30, file: target });
        ok('…or is written where the caller said, creating the folder',
            written.ok && fs.readFileSync(target, 'utf8') === '# FLEET 30d');
        ok('…and the answer names the path', written.result.file === target);
        ok('‼️ …with no temp file left behind — the write is atomic',
            !fs.readdirSync(path.dirname(target)).some(f => f.endsWith('.aftmp')));

        const saved = await reg.dispatch('reports.fleet', { save: true });
        ok('‼️ save:true picks a path AND says it picked one',
            saved.ok && saved.result.chosenForYou === true
            && saved.result.file.startsWith(reportDir) && /pass `file`/.test(saved.result.note));

        const badDays = await reg.dispatch('reports.fleet', { days: -3 });
        ok('a nonsense window is refused', !badDays.ok && /positive number of days/.test(badDays.error));
    }

    // ---- the rest of the reads ----
    {
        const out = await reg.dispatch('reports.outputs', {});
        ok('reports.outputs defaults to one day', out.ok && out.result.content === `# OUTPUTS ${24 * 3600 * 1000}`);
        const cost = await reg.dispatch('reports.cost', {});
        ok('reports.cost returns the anomaly report', cost.ok && cost.result.content === '# COST');

        const trg = await reg.dispatch('reports.triggers', {});
        ok('reports.triggers returns the table', trg.ok && trg.result.content === 'TRIGGER-REPORT');
        triggers = '';
        const noTrg = await reg.dispatch('reports.triggers', {});
        ok('‼️ …and a farm with no triggers is told so, not handed an empty table',
            !noTrg.ok && /no triggers/i.test(noTrg.error));
        triggers = 'TRIGGER-REPORT';

        const an = await reg.dispatch('reports.tasks', { days: 14 });
        ok('reports.tasks is DATA, because it is the one you compute with',
            an.ok && an.result.analytics.runs === 17 && an.result.analytics.days === 14);

        const instr = await reg.dispatch('reports.instructions', { agent: 'yazar' });
        ok('reports.instructions answers for one agent', instr.ok && instr.result.content === '# INSTRUCTIONS yazar');
        const noAgent = await reg.dispatch('reports.instructions', { agent: 'nobody' });
        ok('…and an unknown agent is named', !noAgent.ok && /not found/.test(noAgent.error));
    }

    // ---- the exports ----
    {
        const otlp = await reg.dispatch('export.otlp', {});
        ok('export.otlp hands back the traces themselves, not a string to re-parse',
            otlp.ok && otlp.result.traces.resourceSpans[0].window === 7 * DAY);
        const otlpFile = path.join(root, 'traces.json');
        const w = await reg.dispatch('export.otlp', { days: 1, file: otlpFile });
        ok('…and writes real JSON when asked',
            w.ok && JSON.parse(fs.readFileSync(otlpFile, 'utf8')).resourceSpans[0].window === DAY);

        const sch = await reg.dispatch('export.schedule', { schedule: 'gece taramasi' });
        ok('export.schedule writes the script and HANDS BACK the schtasks line',
            sch.ok && /schtasks \/Create/.test(sch.result.schtasks) && /nothing was registered/i.test(sch.result.note));
        const noSch = await reg.dispatch('export.schedule', { schedule: 'nope' });
        ok('…and an unknown schedule is named', !noSch.ok && /No schedule/.test(noSch.error));

        const rel = await reg.dispatch('export.relayScript', {});
        ok('export.relayScript copies the script out and says where it went',
            rel.ok && fs.existsSync(rel.result.file) && rel.result.chosenForYou === true
            && /farmRelay\.js/.test(rel.result.run));
    }

    // ---- the two that reach the outside world ----
    {
        const look = await reg.dispatch('digest.daily', {});
        ok('‼️ digest.daily only SHOWS the digest by default',
            look.ok && look.result.content === 'today: 3 runs, 1 failure'
            && look.result.sent === false && sent.length === 0);
        const out = await reg.dispatch('digest.daily', { send: true, speak: true });
        ok('…and sends or speaks it only when told to in so many words',
            out.ok && out.result.sent && out.result.spoken && sent.join(',') === 'send,speak');

        const refused = await reg.dispatch('reports.weekly', {});
        ok('‼️ the weekly summary RUNS A MODEL, so it refuses without confirm',
            !refused.ok && /costs money/.test(refused.error));
        const wk = await reg.dispatch('reports.weekly', { confirm: true });
        ok('…and with confirm it returns what the model wrote', wk.ok && wk.result.content === '# WEEKLY');
    }

    // ---- the session's real context ----
    {
        const cap = await reg.dispatch('sessions.context', { session: 'sess-1' });
        ok('sessions.context captures the real category table', cap.ok && cap.result.report.tokens === 42000);
        ok('…and says it cost nothing, because /context is local', /no tokens/.test(cap.result.note));

        live.add('sess-1');
        const liveOne = await reg.dispatch('sessions.context', { session: 'sess-1' });
        ok('‼️ a LIVE session is refused — a second writer on one transcript is not worth the risk',
            !liveOne.ok && /LIVE/.test(liveOne.error));
        live.delete('sess-1');

        const codex = await reg.dispatch('sessions.context', { session: 'sess-cx' });
        ok('‼️ …and a non-Claude engine is refused honestly, not guessed at',
            !codex.ok && /codex/.test(codex.error) && /Claude's own command/.test(codex.error));

        const missing = await reg.dispatch('sessions.context', { session: 'nope' });
        ok('…an unknown session points at the list', !missing.ok && /sessions\.recent/.test(missing.error));

        captured = { ok: false, error: 'claude timed out (90s)' };
        const failed = await reg.dispatch('sessions.context', { session: 'sess-1' });
        ok('…and a failed capture reports WHY', !failed.ok && /timed out/.test(failed.error));
    }

    // ---- the catalog ----
    ok('B-9 ops appear in the catalog',
        ['reports.fleet', 'reports.outputs', 'reports.cost', 'reports.triggers', 'reports.tasks',
            'reports.instructions', 'export.otlp', 'export.schedule', 'export.relayScript',
            'digest.daily', 'reports.weekly', 'sessions.context']
            .every(op => reg.catalog().some(c => c.op === op)));

    // atomicWrite is the write every one of them makes.
    {
        const f = path.join(root, 'deep', 'nested', 'x.md');
        atomicWrite(f, 'hello');
        ok('atomicWrite creates the folder and leaves only the file',
            fs.readFileSync(f, 'utf8') === 'hello'
            && fs.readdirSync(path.dirname(f)).join() === 'x.md');
    }

    fs.rmSync(root, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
