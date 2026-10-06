import * as fs from 'fs';
import { writeAtomicSync } from './atomicFile';
import * as path from 'path';
import { AgentInfo } from './agents';
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { deliverDocument, exportStamp } from './exportDoc';
import { markdownTable, tableOfRecords } from './mdTable';
import { FarmSchedule } from './tasks';

/**
 * Reports, exports and session diagnosis over the bridge (B-9).
 *
 * ‼️ EVERY DOCUMENT THIS EXTENSION PRODUCES EXISTED ONLY AS A THING TO LOOK AT.
 * The cost report opened an editor, the digest opened a save dialog, the OTLP
 * export asked where to put it — so an agent told "work out why yesterday was
 * expensive and write it up" could not get at a single one of them, while the
 * same figures sat in the same functions.
 *
 * One contract runs through all of it: **an op returns the CONTENT.** It opens
 * no editor and no dialog. Pass `file` and it is written there instead, through
 * one atomic write (temp + rename) so a half-written report never appears, and
 * the answer always names the path — including when a default was chosen for
 * you, because a caller that does not know where its output went has not been
 * given an output. Anything that spends money or speaks to the outside world
 * runs only on an explicit flag.
 */

export interface ReportBridgeDeps {
    getAgents(): AgentInfo[];
    /** the fleet report, per period */
    fleetReport(days: number): string;
    /** the outputs digest, per window */
    outputsDigest(windowMs: number): string;
    /** the cost anomaly report */
    costReport(): string;
    /** trigger reliability — undefined when no trigger is configured at all */
    triggerReport(): string | undefined;
    /** the task analytics figures, as data rather than a page */
    taskAnalytics(days: number): unknown;
    /** one agent's instruction history and its measured impact */
    instructionReport(agent: AgentInfo): string;
    /** OTLP traces for the sessions in the window */
    otlp(windowMs: number): unknown;
    schedules(): FarmSchedule[];
    /** the .cmd + schtasks line a schedule would run outside VS Code */
    scheduleExport(schedule: FarmSchedule): { cmdFile: string; script: string; schtasks: string };
    /** where farmRelay.js lives inside this build */
    relayScriptSource(): string;
    /** today's digest body, and the two ways of sending it out */
    digestBody(): string;
    sendDigest(): void;
    speakDigest(): void;
    /** the weekly summary — a cheap MODEL runs, so it costs money */
    weeklySummary(): Promise<string | undefined>;
    /** a session by id, for the context capture */
    findSession(sessionId: string): SessionRef | undefined;
    isLive(sessionId: string): boolean;
    captureContext(s: SessionRef): Promise<{ ok: boolean; report?: unknown; error?: string }>;
    /** where a report goes when the caller names no file */
    defaultReportDir(): string;
}

export interface SessionRef {
    sessionId: string;
    file: string;
    cwd?: string;
    model?: string;
    engine?: string;
    agentName?: string;
    title?: string;
}

/**
 * Write through a temp file and rename. A report is read by whatever is
 * watching the folder, and a reader that catches a half-written markdown file
 * has been given something worse than nothing.
 *
 * ‼️ X-197 — THE RENAME IS THE PART THAT FAILS, AND IT IS SURVIVABLE. On Windows
 * a target another process has open comes back `EPERM` for a lock measured in
 * milliseconds, so `writeAtomicSync` waits it out; and when the attempts really
 * are spent, the error it raises states that NOTHING WAS WRITTEN. That sentence
 * is the point of routing this through one writer rather than keeping a second
 * copy of the same four lines: a caller that cannot tell a failed write from a
 * half-done one retries, and the retry is what wrote six backlog items twice.
 */
export function atomicWrite(file: string, content: string): void {
    const r = writeAtomicSync(file, content);
    if (!r.ok) { throw new Error(r.error); }
}

/** Days → ms, with the op's own default and a refusal for nonsense. */
function windowDays(args: Record<string, unknown>, fallback: number): number {
    const raw = args.days;
    if (raw === undefined || raw === null || raw === '') { return fallback; }
    const n = Number(raw);
    need(Number.isFinite(n) && n > 0 && n <= 3650, '`days` is a positive number of days.');
    return Math.trunc(n);
}

export function registerReportOps(bridge: BridgeRegistry, deps: ReportBridgeDeps): void {
    /**
     * The one delivery rule, in one place: content back, or an atomic write to
     * the path asked for — and the path is always named in the answer. Shared
     * with the pages' own exports (B-21) so both sides file a document the same
     * way.
     */
    const deliver = (
        args: Record<string, unknown>, content: string, defaultName: string
    ): Record<string, unknown> =>
        deliverDocument(args, content, defaultName, () => deps.defaultReportDir());
    const stamp = (): string => exportStamp();

    const findAgent = (ref: string): AgentInfo => {
        const a = deps.getAgents().find(x =>
            x.id === ref || x.name.toLowerCase() === ref.toLowerCase());
        need(a, `Agent "${ref}" not found — agents.list shows the current farm.`);
        return a as AgentInfo;
    };

    bridge.register([
        {
            op: 'reports.fleet',
            describe: 'The comparative fleet report as Markdown: every agent over the window, with sessions, cost, tokens, engine spread, quality and the open health findings. Returns the CONTENT; pass `file` to write it somewhere instead (atomic), or `save:true` to let it land in the report folder. args: days? (default 7), file?, save?',
            handler: (args) => {
                const days = windowDays(args, 7);
                return {
                    days, ...deliver(args, deps.fleetReport(days), `AgentFarm-Report-${stamp()}.md`)
                };
            }
        },
        {
            op: 'reports.outputs',
            describe: 'The outputs digest — what the headless runs in the window actually WROTE, one section per task, with the output bodies folded in. This is the "what came out of the farm today" read; reports.fleet is the "how is the farm doing" one. args: days? (default 1), file?, save?',
            handler: (args) => {
                const days = windowDays(args, 1);
                return {
                    days,
                    ...deliver(args, deps.outputsDigest(days * 24 * 3600 * 1000),
                        `AgentFarm-Outputs-${stamp()}.md`)
                };
            }
        },
        {
            op: 'reports.cost',
            describe: '‼️ WHY WAS TODAY EXPENSIVE — today against a trailing 14-day median with a robust σ, per agent and for the fleet, plus the heavy hitters of the last 7 days. The report states its own scope: the figures are computed off Claude transcripts, and a document that hid that read as the farm halving its spend. ‼️ The reason is the MEASUREMENT, not the money: this series is defined against Claude\'s transcript format and would read zero or read wrong on a foreign one. It is NOT "the others state no price" — two engines state one, and OpenCode\'s dollars are as real as Claude\'s. Those sessions are on the Sessions page. args: file?, save?',
            handler: (args) => deliver(args, deps.costReport(), `AgentFarm-Cost-${stamp()}.md`)
        },
        {
            op: 'reports.triggers',
            describe: 'Trigger reliability over the last 7 days: armed or not, total firings, the 7-day ✓/✗ split, the median delay between firing and actually starting, and the two flags worth acting on — armed-but-never-fired, and always-fails. A farm with no triggers is told so rather than handed an empty table. args: file?, save?',
            handler: (args) => {
                const md = deps.triggerReport();
                need(md, 'No triggers are configured — there is nothing to report on.');
                return deliver(args, md as string, `AgentFarm-Triggers-${stamp()}.md`);
            }
        },
        {
            op: 'reports.tasks',
            describe: 'Task analytics as DATA, not a page: throughput, success rate, duration and cost distributions and the forecast, over the window. This is the one report that is JSON rather than markdown, because it is the one a caller wants to compute with. args: days? (default 30)',
            handler: (args) => {
                const days = windowDays(args, 30);
                return { days, analytics: deps.taskAnalytics(days) };
            }
        },
        {
            op: 'tasks.analytics.export',
            describe: 'B-21 — THE TASK ANALYTICS PAGE AS A DOCUMENT. reports.tasks hands back the figures to compute with; this hands back the page\'s own Markdown — the per-agent scorecards and the recurring task families as tables, assembled by the function the page\'s ⬇ MD button uses. Columns are derived from the rows, so a figure the stats start carrying appears here without anybody adding a column. args: days? (default 30) · file? (write there, atomically) · save? (let it land in the report folder). Returns the content when neither is given.',
            handler: (args) => {
                const days = windowDays(args, 30);
                const a = (deps.taskAnalytics(days) ?? {}) as Record<string, unknown>;
                const asRows = (v: unknown): Record<string, unknown>[] =>
                    Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Record<string, unknown>[] : [];
                const tables = [
                    { key: 'agents', title: 'Agents' },
                    { key: 'families', title: 'Task families' }
                ].map(t => ({ t, rows: asRows(a[t.key]) }))
                    .filter(x => x.rows.length)
                    .map(x => tableOfRecords(x.t.title, x.rows));
                need(tables.length > 0, `Nothing ran in the last ${days} day(s) — there is no analytics to export.`);
                // ‼️ markdownTable, the page's own builder — not a second one
                // that would drift from it (the parity gate reads exactly this).
                const md = [`# Agent Farm — task analytics (${days} days)`, '']
                    .concat(tables.map(t => markdownTable(t).replace(/^# /, '## ')))
                    .join('\n');
                return {
                    days, tables: tables.map(t => ({ title: t.title, rows: t.rows.length })),
                    ...deliver(args, md, `AgentFarm-TaskAnalytics-${stamp()}.md`)
                };
            }
        },
        {
            op: 'reports.instructions',
            describe: 'One agent\'s instruction history with its measured impact — every recorded version of its CLAUDE.md against what happened to quality and cost after it. The answer to "did that rewrite help?", which had no way out of the palette. args: agent (name|id), file?, save?',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                return {
                    agent: agent.name,
                    ...deliver(args, deps.instructionReport(agent),
                        `AgentFarm-Instructions-${agent.name}-${stamp()}.md`)
                };
            }
        },
        {
            op: 'export.otlp',
            describe: 'The window\'s sessions as OTLP/JSON traces — one trace per session, one span per turn — for anything that reads OpenTelemetry (Jaeger, Tempo, Honeycomb). Returns the JSON; `file` writes it. args: days? (default 7), file?, save?',
            handler: (args) => {
                const days = windowDays(args, 7);
                const json = deps.otlp(days * 24 * 3600 * 1000);
                const text = JSON.stringify(json, null, 2);
                const out = deliver(args, text, `AgentFarm-otlp-${stamp()}.json`);
                // The caller asked for traces, not for a string to re-parse.
                return out.file ? { days, ...out } : { days, ...out, traces: json };
            }
        },
        {
            op: 'export.schedule',
            describe: 'What a schedule looks like OUTSIDE VS Code: the .cmd this farm writes for it — running the engine the schedule would really use, in the agent\'s folder, logging where the farm logs — and the exact `schtasks /Create` line that registers it. It only WRITES THE SCRIPT and hands the line back; registering it is the user\'s own paste, because a scheduled task the farm installs behind an agent\'s back is not the same object as one somebody chose. args: schedule (id or title)',
            handler: (args) => {
                const ref = argStr(args, 'schedule');
                const s = deps.schedules().find(x =>
                    x.id === ref || x.title.toLowerCase() === ref.toLowerCase());
                need(s, `No schedule "${ref}" — schedules.list shows what is installed.`);
                const made = deps.scheduleExport(s as FarmSchedule);
                return {
                    schedule: (s as FarmSchedule).title, agent: (s as FarmSchedule).agentName,
                    cmdFile: made.cmdFile, script: made.script, schtasks: made.schtasks,
                    note: `The script is written. Paste the schtasks line into a terminal to register it — nothing was registered for you.`
                };
            }
        },
        {
            op: 'export.relayScript',
            describe: 'Copy out farmRelay.js — the little watcher that runs on ANOTHER machine, reads its ~/.claude and appends that machine\'s sessions to a file this farm can read through agentFarm.relayFeeds. Pass `file` to say where it lands; with none it goes to the report folder. The answer carries the command line to run on the other machine. args: file?',
            handler: (args) => {
                const src = deps.relayScriptSource();
                need(fs.existsSync(src),
                    'The relay script is missing from this build (out/service/farmRelay.js) — reinstall the extension.');
                const target = optStr(args, 'file')
                    ? path.resolve(optStr(args, 'file'))
                    : path.join(deps.defaultReportDir(), 'farmRelay.js');
                atomicWrite(target, fs.readFileSync(src, 'utf8'));
                return {
                    file: target, chosenForYou: !optStr(args, 'file'),
                    run: 'node farmRelay.js --claude %USERPROFILE%\\.claude --out <syncedFolder>\\relay-<machine>.jsonl --machine <machine>',
                    note: 'Copy it to the OTHER machine, run it there, then add the synced file here via agentFarm.relayFeeds.'
                };
            }
        },
        {
            op: 'digest.daily',
            describe: '‼️ TODAY\'S DIGEST — and by default it only SHOWS it to you. `send:true` puts it out through the configured channel and `speak:true` reads it aloud (this computer\'s own voice while `agentFarm.digestTtsModel` is empty; with a fal.ai model there, an audio file in `agentFarm.digestTtsFolder`); both are gestures aimed at the outside world, so neither happens because an op was called to look at the text. Doing both in one call is allowed and is what the scheduled digest does. args: send? (default false), speak? (default false)',
            handler: (args) => {
                const body = deps.digestBody();
                const send = args.send === true;
                const speak = args.speak === true;
                if (send) { deps.sendDigest(); }
                if (speak) { deps.speakDigest(); }
                return {
                    content: body, sent: send, spoken: speak,
                    note: send || speak
                        ? `Digest ${[send ? 'sent' : '', speak ? 'spoken' : ''].filter(Boolean).join(' and ')}.`
                        : 'Nothing was sent — pass send:true or speak:true for that.'
                };
            }
        },
        {
            op: 'reports.weekly',
            describe: '‼️ COST-BEARING — this one RUNS A MODEL. The weekly summary is written by a cheap model over the week\'s sessions, so calling it spends real money and it refuses to run without `confirm:true`. Everything else in this area is computed from files already on this disk and costs nothing. args: confirm (true — required), file?, save?',
            handler: async (args) => {
                need(args.confirm === true,
                    'The weekly summary asks a model to write it, which costs money — pass confirm:true if that is meant.');
                const md = await deps.weeklySummary();
                need(md, 'The summary could not be produced — the model returned nothing.');
                return deliver(args, md as string, `AgentFarm-Weekly-${stamp()}.md`);
            }
        },
        {
            op: 'sessions.context',
            describe: '‼️ WHAT IS ACTUALLY IN THAT SESSION\'S CONTEXT — the real per-category token table, captured by resuming the session and running Claude\'s own local `/context`. It costs NO tokens: the command is local, makes no API call and appends one harmless line to the transcript. Two refusals, both deliberate: a LIVE session is never touched, because a second writer on one transcript file is a risk not worth taking, and a non-Claude engine has no /context to run — it is said rather than guessed at. args: session (id)',
            handler: async (args) => {
                const id = argStr(args, 'session');
                const s = deps.findSession(id);
                need(s, `No session "${id}" — sessions.recent lists them.`);
                const sess = s as SessionRef;
                const engine = (sess.engine ?? 'claude').toLowerCase();
                need(engine === 'claude',
                    `That session ran on ${engine}, and /context is Claude's own command — there is nothing equivalent to capture.`);
                need(!deps.isLive(sess.sessionId),
                    'That session is LIVE. Capturing would put a second writer on the transcript it is still writing — close it first.');
                const r = await deps.captureContext(sess);
                need(r.ok, `The capture failed — ${r.error ?? 'no output'}`);
                return {
                    session: sess.sessionId, title: sess.title ?? null,
                    agent: sess.agentName ?? null, model: sess.model ?? null,
                    report: r.report,
                    note: 'Captured locally — no tokens were spent.'
                };
            }
        }
    ]);
}
