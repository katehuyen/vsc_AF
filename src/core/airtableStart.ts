/**
 * X-416 — STARTING A LOCAL AIRTABLE ENGINE WITHOUT A BROWSER.
 *
 * An instance's `start_admin.bat` runs `npm install` and a UI build on every
 * start and opens a browser tab — right for a person, wrong for an agent that
 * only needs the API. The engine itself is `node server.js` in `<instance>\Admin`
 * (the port is read from the instance's own config.json; the UI is already
 * built), so that is what is started here: detached and hidden, so it outlives
 * the extension host exactly as the .bat's window does, its output appended to
 * a log file. Then its health is polled until it answers or the wait runs out.
 */
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { checkInstances, discoverInstances, EngineInstance } from '../mcp/airtable/engine';
import { expandedDatabaseRoots, loadStore } from './airtable';

export interface EngineStartPlan { cmd: string; args: string[]; cwd: string; log: string }

/** What starting this instance runs — or why it cannot be started from here. */
export function engineStartPlan(inst: EngineInstance, logDir: string, has: (p: string) => boolean): EngineStartPlan | { error: string } {
    const admin = path.join(inst.dir, 'Admin');
    if (!has(path.join(admin, 'server.js'))) { return { error: `${inst.name} has no Admin\\server.js in ${inst.dir}` }; }
    if (!has(path.join(admin, 'node_modules'))) {
        return { error: `${inst.name}: Admin\\node_modules is missing — run start_admin.bat in ${inst.dir} once, it installs them` };
    }
    return { cmd: 'node', args: ['server.js'], cwd: admin, log: path.join(logDir, `airtable-engine-${inst.name}.log`) };
}

export interface EngineStartResult {
    ok: boolean;
    instance: string;
    port: number;
    alreadyRunning?: boolean;
    ms: number;
    log?: string;
    error?: string;
}

export interface EngineStartDeps {
    has?: (p: string) => boolean;
    spawn?: (plan: EngineStartPlan) => void;
    alive?: (inst: EngineInstance) => Promise<boolean>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
}

function spawnDetached(plan: EngineStartPlan): void {
    fs.mkdirSync(path.dirname(plan.log), { recursive: true });
    const out = fs.openSync(plan.log, 'a');
    fs.writeSync(out, `\n--- ${new Date().toISOString()} ${plan.cmd} ${plan.args.join(' ')} (cwd ${plan.cwd})\n`);
    const child = cp.spawn(plan.cmd, plan.args, { cwd: plan.cwd, detached: true, windowsHide: true, stdio: ['ignore', out, out] });
    child.unref();
    fs.closeSync(out);
}

const tail = (file: string, lines = 6): string => {
    try { return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(-lines).join(' ⏎ '); } catch { return ''; }
};

/** Start one instance unless it already answers; wait until it does (default 20 s). */
export async function startEngine(inst: EngineInstance, logDir: string, deps: EngineStartDeps = {}): Promise<EngineStartResult> {
    const now = deps.now ?? Date.now;
    const alive = deps.alive ?? (async (i: EngineInstance) => (await checkInstances([i]))[0]?.alive === true);
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    const t0 = now();
    const base = { instance: inst.name, port: inst.port };
    if (await alive(inst)) { return { ok: true, ...base, alreadyRunning: true, ms: 0 }; }
    const plan = engineStartPlan(inst, logDir, deps.has ?? (p => fs.existsSync(p)));
    if ('error' in plan) { return { ok: false, ...base, ms: now() - t0, error: plan.error }; }
    try {
        (deps.spawn ?? spawnDetached)(plan);
    } catch (e) {
        return { ok: false, ...base, ms: now() - t0, log: plan.log, error: `could not start node: ${(e as Error).message}` };
    }
    const limit = deps.timeoutMs ?? 20_000;
    while (now() - t0 < limit) {
        await sleep(500);
        if (await alive(inst)) { return { ok: true, ...base, ms: now() - t0, log: plan.log }; }
    }
    const last = tail(plan.log);
    return {
        ok: false, ...base, ms: now() - t0, log: plan.log,
        error: `started, but nothing answered on port ${inst.port} within ${Math.round(limit / 1000)} s${last ? ` — its log ends: ${last}` : ` — see ${plan.log}`}`
    };
}

/** Start the instance of that name (default: the module's default) — the one door for the page's Start and airtable.start. */
export async function startNamedInstance(storageDir: string, name: string | undefined, deps: EngineStartDeps = {}): Promise<EngineStartResult> {
    const store = loadStore(storageDir);
    const inst = findInstance(expandedDatabaseRoots(store), String(name ?? '').trim() || store.defaultInstance);
    if ('error' in inst) { return { ok: false, instance: String(name ?? ''), port: 0, ms: 0, error: inst.error }; }
    return startEngine(inst, storageDir, deps);
}

/** The instance of that name under these roots (case-insensitive), or the reason there is none. */
export function findInstance(roots: string[], name: string): EngineInstance | { error: string } {
    const all = discoverInstances(roots);
    const want = String(name || '').trim();
    if (!want) { return { error: 'no instance named — and the module has no default instance' }; }
    const hit = all.find(i => i.name.toLowerCase() === want.toLowerCase());
    return hit ?? { error: `there is no instance "${want}" — ${all.map(i => i.name).join(', ') || 'none found under the database roots'}` };
}
