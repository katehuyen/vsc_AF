/**
 * H4 — Agent Farm headless service. A tiny standalone node process (no
 * vscode, no dependencies) that keeps schedules and watch-triggers alive
 * while VS Code is closed. It shares the extension's storage folder:
 *
 *   node farmService.js --storage <globalStorageDir>
 *
 * Coordination contract:
 * - The extension writes `live.heartbeat` (epoch ms) every 30s while running.
 *   While the heartbeat is fresh the service stays idle — VS Code owns the farm.
 * - When the heartbeat is stale the service processes due schedules and watch
 *   triggers, spawns `claude -p` headless runs, archives outputs into the same
 *   task-outputs folder and appends task records to farm-tasks.json, so the
 *   panel picks everything up on next launch.
 * - Every action is also logged to service-runs.jsonl (the extension shows a
 *   "while you were away" digest from it).
 *
 * Scope: schedules + watch triggers with a fixed-agent task action. Hook and
 * webhook triggers need the live listener; workflow/dispatch actions need the
 * full engine — both stay VS Code-side by design.
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { full as afFull } from '../core/aftime';
import { headlessAccountPlan } from '../core/accountStore';
import { serviceRemoteFor } from './serviceRemote';

interface ServiceConfig {
    agents: { id: string; name: string; dir: string }[];
    extraArgs?: string;
    maxConcurrent?: number;
    /**
     * ‼️ X-260 (2/n) — THE SIGN-INS, SO A NIGHT RUN CAN SPEND THE RIGHT ONE.
     *
     * An account is a config DIRECTORY, and the slot table that maps an id onto
     * one lives in VS Code settings — which this process cannot read. So the
     * extension writes it here beside the agent map, for the same reason the
     * agent map is here: the service knows what the file tells it and nothing
     * else. Shapes deliberately loose (`unknown` at the seam) because they come
     * off a file, and `headlessAccountPlan` normalises them.
     */
    accounts?: unknown;
    /** which sign-in each engine is standing on, when an item names none. */
    activeAccounts?: unknown;
    /**
     * X-255 - the sign-in each AGENT stands on, per engine, keyed by the agent's
     * normalised directory. It outranks activeAccounts for that agent, so a
     * night run of a pinned agent spends the plan its row names rather than
     * whatever the Engines page was last pressed for.
     */
    agentAccounts?: unknown;
}

/**
 * ‼️ X-260 (2/n) — WHAT A SCHEDULE OR A TRIGGER ACTION ALREADY CARRIES.
 *
 * `FarmSchedule extends RunDimensions` and a trigger's `{ kind: 'task' }`
 * action does too (`src/core/tasks.ts`), so both of these are written on the
 * item when the user makes it and are already in `farm-tasks.json`. This
 * service simply did not read them: it spawned `claude` with no environment,
 * and whichever sign-in the machine happened to hold paid.
 */
interface RunAxes {
    /** whose plan pays — a slot id, or `@machine` stated outright. */
    account?: string;
    /** which engine the item asked for; this service can only spawn `claude`. */
    engine?: string;
}

interface StoredSchedule extends RunAxes {
    id: string; agentId: string; agentName: string; title: string; prompt: string;
    mode: string; kind: 'daily' | 'weekly' | 'once';
    hour: number; minute: number; dow?: number; onceAt?: number;
    enabled: boolean; lastRunKey?: string;
}

interface StoredTrigger {
    id: string; title: string; type: string; watchPath?: string;
    action?: { kind: string; agentId?: string; agentName?: string; title?: string; prompt?: string }
        & RunAxes;
    debounceSec: number; cooldownSec: number; maxPerHour: number;
    enabled: boolean; lastFiredAt?: number; fireCount?: number; recentFirings?: number[];
}

interface StoredTask extends RunAxes {
    id: string; agentId: string; agentName: string; title: string; prompt: string;
    mode: string; status: string; createdAt: number; startedAt?: number; endedAt?: number;
    fromSchedule?: string; fromTrigger?: string; outputFile?: string;
}

const HEARTBEAT_STALE_MS = 90_000;
const TICK_MS = 30_000;

function arg(name: string): string | undefined {
    const i = process.argv.indexOf('--' + name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const storageDir = arg('storage') ?? '';
if (!storageDir || !fs.existsSync(storageDir)) {
    console.error('usage: node farmService.js --storage <globalStorageDir>');
    process.exit(2);
}

const tasksFile = path.join(storageDir, 'farm-tasks.json');
const configFile = path.join(storageDir, 'service-config.json');
const heartbeatFile = path.join(storageDir, 'live.heartbeat');
const runsFile = path.join(storageDir, 'service-runs.jsonl');
const outputsDir = path.join(storageDir, 'task-outputs');

function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logRun(entry: Record<string, unknown>): void {
    try {
        fs.appendFileSync(runsFile, JSON.stringify({ ts: Date.now(), ...entry }) + '\n', 'utf8');
    } catch { /* best-effort */ }
}

function vscodeAlive(): boolean {
    try {
        const raw = fs.readFileSync(heartbeatFile, 'utf8').trim();
        return Date.now() - Number(raw) < HEARTBEAT_STALE_MS;
    } catch { return false; }
}

function readConfig(): ServiceConfig {
    try { return JSON.parse(fs.readFileSync(configFile, 'utf8')) as ServiceConfig; }
    catch { return { agents: [] }; }
}

function readStore(): { tasks: StoredTask[]; schedules: StoredSchedule[]; triggers: StoredTrigger[]; raw: Record<string, unknown> } {
    try {
        const raw = JSON.parse(fs.readFileSync(tasksFile, 'utf8')) as Record<string, unknown>;
        return {
            tasks: Array.isArray(raw.tasks) ? raw.tasks as StoredTask[] : [],
            schedules: Array.isArray(raw.schedules) ? raw.schedules as StoredSchedule[] : [],
            triggers: Array.isArray(raw.triggers) ? raw.triggers as StoredTrigger[] : [],
            raw
        };
    } catch {
        return { tasks: [], schedules: [], triggers: [], raw: {} };
    }
}

/** Read-modify-write of farm-tasks.json — only ever called when VS Code is away. */
function writeStore(store: { tasks: StoredTask[]; schedules: StoredSchedule[]; triggers: StoredTrigger[]; raw: Record<string, unknown> }): void {
    try {
        const out = { ...store.raw, tasks: store.tasks, schedules: store.schedules, triggers: store.triggers };
        fs.writeFileSync(tasksFile, JSON.stringify(out, null, 2), 'utf8');
    } catch (e) {
        log('store write failed: ' + String(e));
    }
}

function newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sanitizePrompt(p: string): string {
    return p.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
}

/** Same due-check semantics as the extension's scheduler. */
function scheduleDue(s: StoredSchedule, now: Date): { due: boolean; runKey: string } {
    if (!s.enabled) { return { due: false, runKey: '' }; }
    if (s.kind === 'once') {
        return {
            due: !!s.onceAt && now.getTime() >= s.onceAt && s.lastRunKey !== 'once',
            runKey: 'once'
        };
    }
    const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const target = s.hour * 60 + s.minute;
    if (minutes < target) { return { due: false, runKey: dayKey }; }
    if (s.kind === 'weekly' && now.getDay() !== s.dow) { return { due: false, runKey: dayKey }; }
    return { due: s.lastRunKey !== dayKey, runKey: dayKey };
}

let runningCount = 0;

/**
 * ‼️ X-260 (2/n) — THE ENVIRONMENT A NIGHT RUN SPAWNS IN, so the plan that pays
 * is the one written on the item rather than whichever the machine held.
 *
 * `null` from the plan means REMOVE the variable — the `@machine` answer, which
 * is a statement of "the machine's own sign-in" and is not the same as saying
 * nothing. Anything else is added on top of this process's own environment,
 * which is what the spawn inherited before and must go on inheriting.
 */
function envForRun(plan: { env: Record<string, string | null> }): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const [k, v] of Object.entries(plan.env)) {
        if (v === null) { delete env[k]; } else { env[k] = v; }
    }
    return env;
}

function spawnHeadless(cfgSvc: ServiceConfig, task: StoredTask, agentDir: string): void {
    fs.mkdirSync(outputsDir, { recursive: true });
    const outFile = path.join(outputsDir, `${task.id}.md`);
    task.outputFile = outFile;
    task.status = 'running';
    task.startedAt = Date.now();
    // ‼️ X-260 (2/n) — resolved BEFORE the output file is written, because a
    // refused run must not leave a half-written report claiming it started.
    const plan = headlessAccountPlan(
        { engine: task.engine, account: task.account, agentDir: agentDir }, cfgSvc);
    const header = `# ${task.title}\n\n- Agent: ${task.agentName}\n- Started: ${afFull(Date.now())} (headless service)\n`
        // Said in the report itself: a run nobody watched must be able to answer
        // "whose plan did this spend" months later, and the transcript cannot —
        // every slot's projects folder is a junction onto one shared root.
        + `- Account: ${plan.account || 'the machine sign-in (nothing injected)'}\n`
        + `- Prompt: ${task.prompt}\n\n---\n\n`;
    fs.writeFileSync(outFile, header, 'utf8');
    const stream = fs.createWriteStream(outFile, { flags: 'a' });
    const extra = (cfgSvc.extraArgs ?? '').trim();
    const child = cp.spawn(`claude ${extra ? extra + ' ' : ''}-p "${sanitizePrompt(task.prompt)}"`, {
        cwd: agentDir,
        shell: true,
        windowsHide: true,
        env: envForRun(plan),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    runningCount++;
    child.stdout?.on('data', c => stream.write(c));
    child.stderr?.on('data', c => stream.write(c));
    const finish = (status: string, note: string) => {
        runningCount--;
        stream.write(`\n\n---\nFinished: ${afFull(Date.now())} · ${note}\n`);
        stream.end();
        task.status = status;
        task.endedAt = Date.now();
        // persist the final status (only while VS Code is away — re-check)
        if (!vscodeAlive()) {
            const store = readStore();
            const idx = store.tasks.findIndex(t => t.id === task.id);
            if (idx >= 0) { store.tasks[idx] = task; } else { store.tasks.push(task); }
            writeStore(store);
        }
        logRun({ kind: 'task-finished', taskId: task.id, title: task.title, agent: task.agentName, status });
        log(`task "${task.title}" → ${status}`);
    };
    child.on('error', err => finish('failed', 'spawn error ' + String(err)));
    child.on('close', code => finish(code === 0 ? 'done' : 'failed', `exit ${code ?? '?'}`));
}

function launchTask(cfgSvc: ServiceConfig, store: ReturnType<typeof readStore>,
    agentId: string, agentName: string, title: string, prompt: string,
    origin: { fromSchedule?: string; fromTrigger?: string }, axes: RunAxes = {}): boolean {
    const maxConc = cfgSvc.maxConcurrent ?? 1;
    if (runningCount >= maxConc) {
        log(`deferred "${title}" — ${runningCount} running`);
        return false;
    }
    const agent = cfgSvc.agents.find(a => a.id === agentId);
    if (!agent || !fs.existsSync(agent.dir)) {
        logRun({ kind: 'task-skipped', title, reason: 'agent dir missing' });
        return false;
    }
    /**
     * ‼️ X-260 (2/n) — A SIGN-IN THAT CANNOT BE RESOLVED STOPS THE RUN.
     *
     * The item named a slot this machine no longer holds, or one belonging to
     * another engine, or the service has not been handed the table yet.
     * Starting anyway would spend a window on a plan nobody chose and record it
     * as the one they did — with nobody at a window to notice, which is why
     * this is worse at night rather than more forgivable. The skip is logged
     * where the "while you were away" digest reads, so it is visible in the
     * morning.
     */
    const plan = headlessAccountPlan(
        { engine: axes.engine, account: axes.account, agentDir: agent.dir }, cfgSvc);
    if (plan.refusal) {
        logRun({ kind: 'task-skipped', title, reason: plan.refusal });
        log(`skipped "${title}" — ${plan.refusal}`);
        return false;
    }
    // ‼️ AND AN ENGINE THIS SERVICE CANNOT SPAWN IS SAID, not silently served by
    // claude. It runs one engine today; an item asking for another gets its
    // turn on the wrong CLI, which no environment can fix. Said rather than
    // refused, because that is the behaviour every schedule already has and
    // taking it away in an account commit would be a second change wearing the
    // shape of this one.
    const wantEngine = String(axes.engine || '').trim().toLowerCase();
    if (wantEngine && wantEngine !== 'claude') {
        log(`"${title}" asks for engine "${wantEngine}" — this service only spawns claude`);
    }
    const task: StoredTask = {
        id: newId(), agentId, agentName, title, prompt,
        mode: 'headless', status: 'running', createdAt: Date.now(),
        // The axes travel onto the record, so the run's own report and the
        // panel that picks it up next launch can both say whose plan paid.
        ...(axes.account ? { account: axes.account } : {}),
        ...(axes.engine ? { engine: axes.engine } : {}),
        ...origin
    };
    store.tasks.push(task);
    logRun({ kind: 'task-started', taskId: task.id, title, agent: agentName });
    spawnHeadless(cfgSvc, task, agent.dir);
    return true;
}

// ---------- watch triggers ----------

const watchers = new Map<string, fs.FSWatcher>();
const debounceTimers = new Map<string, NodeJS.Timeout>();

function armWatchers(): void {
    const store = readStore();
    const wanted = new Map<string, StoredTrigger>();
    for (const t of store.triggers) {
        if (t.enabled && t.type === 'watch' && t.watchPath && t.action?.kind === 'task' &&
            fs.existsSync(t.watchPath)) {
            wanted.set(t.id, t);
        }
    }
    for (const [id, w] of watchers) {
        if (!wanted.has(id)) { try { w.close(); } catch { /* gone */ } watchers.delete(id); }
    }
    for (const [id, t] of wanted) {
        if (watchers.has(id)) { continue; }
        try {
            const watcher = fs.watch(t.watchPath as string, { recursive: true }, () => {
                if (vscodeAlive()) { return; } // VS Code's own TriggerManager handles it
                const prev = debounceTimers.get(id);
                if (prev) { clearTimeout(prev); }
                debounceTimers.set(id, setTimeout(() => fireWatchTrigger(id), (t.debounceSec || 5) * 1000));
            });
            watchers.set(id, watcher);
            log(`watching (${t.title}): ${t.watchPath}`);
        } catch (e) {
            log(`watch failed for ${t.watchPath}: ${String(e)}`);
        }
    }
}

function fireWatchTrigger(id: string): void {
    if (vscodeAlive()) { return; }
    const store = readStore();
    const t = store.triggers.find(x => x.id === id);
    if (!t || !t.enabled || t.action?.kind !== 'task') { return; }
    const now = Date.now();
    if (t.lastFiredAt && now - t.lastFiredAt < (t.cooldownSec || 0) * 1000) { return; }
    const recent = (t.recentFirings ?? []).filter(ts => now - ts < 3600_000);
    if (t.maxPerHour > 0 && recent.length >= t.maxPerHour) { return; }
    t.lastFiredAt = now;
    t.fireCount = (t.fireCount ?? 0) + 1;
    t.recentFirings = [...recent, now];
    const prompt = (t.action.prompt ?? '').split('{watch}').join(t.watchPath ?? '');
    logRun({ kind: 'trigger-fired', triggerId: t.id, title: t.title });
    launchTask(readConfig(), store, t.action.agentId ?? '', t.action.agentName ?? '?',
        `${t.title} (service)`, prompt, { fromTrigger: t.id },
        // X-260 (2/n) — the action's own axes. A trigger's task action extends
        // RunDimensions, so this reads a field that was always written.
        { account: t.action.account, engine: t.action.engine });
    writeStore(store);
}

// ---------- C1: the web view, while VS Code is away ----------
// The extension owns the port whenever it is running; this side takes it over
// only once the heartbeat goes stale, and gives it straight back. Same server,
// same page, same snapshot file — the page just says the snapshot is the last
// one the extension managed to write, because pretending otherwise would be a
// lie about how fresh the numbers are.

interface WebServerModule {
    startWebServer(opts: Record<string, unknown>,
        onError?: (e: Error) => void): { close(): void; url(): string } | undefined;
}

const webConfigFile = path.join(storageDir, 'web-config.json');
const snapshotFile = path.join(storageDir, 'web-snapshot.json');
let webHandle: { close(): void } | undefined;

function readWebConfig(): { enabled: boolean; port: number; bind: 'local' | 'lan'; token: string } | undefined {
    try {
        const raw = JSON.parse(fs.readFileSync(webConfigFile, 'utf8')) as Record<string, unknown>;
        const token = typeof raw.token === 'string' ? raw.token : '';
        if (raw.enabled !== true || !token) { return undefined; }
        return {
            enabled: true,
            port: typeof raw.port === 'number' ? raw.port : 8378,
            bind: raw.bind === 'lan' ? 'lan' : 'local',
            token
        };
    } catch { return undefined; }
}

/** Mark the snapshot as served by this side, so the page can say so. */
function stampSnapshotWriter(): void {
    try {
        const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) as Record<string, unknown>;
        if (snap.writer === 'service') { return; }
        snap.writer = 'service';
        fs.writeFileSync(snapshotFile, JSON.stringify(snap), 'utf8');
    } catch { /* nothing written yet — the server serves {} and the page says so */ }
}

function syncWebServer(): void {
    const cfgWeb = readWebConfig();
    const shouldServe = !!cfgWeb && !vscodeAlive();
    if (!shouldServe) {
        if (webHandle) { webHandle.close(); webHandle = undefined; log('web view handed back to VS Code'); }
        return;
    }
    if (webHandle) { return; }
    try {
        // compiled sibling module — the service ships in the same out/ tree
        const mod = require('../core/webserver.js') as WebServerModule;
        stampSnapshotWriter();
        webHandle = mod.startWebServer({
            port: cfgWeb!.port, bind: cfgWeb!.bind, token: cfgWeb!.token,
            snapshotFile, writer: 'service', onLog: (l: string) => log(l)
        }, e => log('web view error: ' + String(e)));
        if (webHandle) {
            log(`web view served by the service on :${cfgWeb!.port} (VS Code is away)`);
            logRun({ kind: 'web-served', port: cfgWeb!.port });
        }
    } catch (e) {
        log('web view could not start: ' + String(e));
    }
}

// X-449 — the phone's host while VS Code is away (serviceRemote.ts)
const phoneHost = serviceRemoteFor(storageDir, heartbeatFile, snapshotFile, log);

// ---------- main loop ----------

function tick(): void {
    syncWebServer();
    void phoneHost.sync(vscodeAlive());
    if (vscodeAlive()) { return; }
    const store = readStore();
    const cfgSvc = readConfig();
    const now = new Date();
    let dirty = false;
    for (const s of store.schedules) {
        const { due, runKey } = scheduleDue(s, now);
        if (!due) { continue; }
        s.lastRunKey = runKey;
        if (s.kind === 'once') { s.enabled = false; }
        dirty = true;
        logRun({ kind: 'schedule-due', scheduleId: s.id, title: s.title });
        launchTask(cfgSvc, store, s.agentId, s.agentName, `${s.title} (service)`, s.prompt,
            { fromSchedule: s.id },
            // X-260 (2/n) — FarmSchedule extends RunDimensions; the sign-in the
            // user chose when they made this schedule has been on the file all
            // along, and this is the hop that was missing.
            { account: s.account, engine: s.engine });
    }
    if (dirty) { writeStore(store); }
    armWatchers();
}

log(`Agent Farm headless service up — storage: ${storageDir}`);
logRun({ kind: 'service-start' });
armWatchers();
setInterval(tick, TICK_MS);
tick();
