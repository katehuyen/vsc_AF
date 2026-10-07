/**
 * ‼️ X-449 — THE PHONE STILL REACHES THE FARM WHILE VS CODE IS CLOSED.
 *
 * The extension hosts the phone (src/remote) while a window runs the task
 * queue. When VS Code is away, the headless service takes the same port with
 * the same certificate, device book and farm id, so a paired phone reconnects
 * as if nothing changed. Nothing runs behind it: no events, no pages, and every
 * op is refused with one sentence except three — farm.ping, farm.away (since
 * when, and the last snapshot with its age) and farm.open (start VS Code; the
 * extension takes the port back and the phone is on the full farm again). The
 * service lets go the tick it sees the heartbeat fresh; the extension retries
 * meanwhile.
 *
 * Node only: what this side cannot read from VS Code settings the extension
 * writes into `remote-config.json` (mode, port, the VS Code executable).
 */
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isListenMode, listenPlan, REMOTE_CONFIG_FILE, type ListenMode, type NetTable } from '../core/remoteListen';
import { snapshotAge } from '../core/websnapshot';
import { farmIdentity, isFeature, startRemoteHost, type FarmIdentity, type ListenAt, type OpResult, type RemotePort, type RunningRemote } from '../remote';

/** The service's own host: the real server, this machine's farm id, the build's media folder. */
export function serviceRemoteFor(storageDir: string, heartbeatFile: string, snapshotFile: string, log: (line: string) => void): ServiceRemote {
    return new ServiceRemote({
        storageDir, heartbeatFile, snapshotFile, log,
        resourceDir: path.join(__dirname, '..', '..', 'media'),
        start: (port, at) => startRemoteHost(port, at),
        farm: dir => farmIdentity(dir, os.hostname())
    });
}

/** A second farm.open inside this window is answered, not launched again. */
export const OPEN_AGAIN_MS = 90_000;

export interface RemoteServiceConfig { mode: ListenMode; port: number; codeExe: string }

export function readRemoteConfig(file: string): RemoteServiceConfig | undefined {
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
        if (!isListenMode(raw.mode) || typeof raw.port !== 'number') { return undefined; }
        return { mode: raw.mode, port: raw.port, codeExe: typeof raw.codeExe === 'string' ? raw.codeExe : '' };
    } catch { return undefined; }
}

/** Where the away host listens, or why it does not. */
export function awayTarget(cfg: RemoteServiceConfig | undefined, alive: boolean, table: NetTable): { at: ListenAt } | { why: string } {
    if (alive) { return { why: 'VS Code is running — it hosts the phone' }; }
    if (!cfg) { return { why: `no ${REMOTE_CONFIG_FILE} — VS Code has not written the phone settings yet` }; }
    const plan = listenPlan(cfg.mode, table);
    return plan.listen ? { at: { host: plan.host, port: cfg.port } } : { why: plan.reason };
}

export function awaySentence(farm: string): string {
    return `Agent Farm is not running: VS Code is closed on ${farm}. farm.away shows the last state it saved; farm.open starts it.`;
}

/** The environment VS Code is started with: nothing that would make Code.exe run as node or join a dead window. */
export function openEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const out: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(env)) {
        if (/^(ELECTRON_RUN_AS_NODE|ATOM_SHELL_INTERNAL_RUN_AS_NODE|VSCODE_.*)$/i.test(k)) { continue; }
        out[k] = v;
    }
    return out;
}

export interface AwayDeps {
    farm: () => FarmIdentity;
    config: () => RemoteServiceConfig | undefined;
    /** the last heartbeat VS Code wrote, epoch ms */
    lastSeen: () => number | undefined;
    /** the snapshot file's JSON, undefined when there is none */
    snapshot: () => { ts?: number; [k: string]: unknown } | undefined;
    launch: (exe: string, env: NodeJS.ProcessEnv) => void;
    now: () => number;
    log: (line: string) => void;
}

/** The away host's ops: three answered, the rest refused by name. `opened` is the last farm.open, kept by the caller. */
export function awayCall(op: string, d: AwayDeps, opened: { at?: number }): OpResult {
    const farm = d.farm().name;
    if (op === 'farm.ping') { return { ok: true, result: { pong: true, away: true } }; }
    if (op === 'farm.away') {
        const snap = d.snapshot();
        const ts = typeof snap?.ts === 'number' ? snap.ts : undefined;
        return { ok: true, result: {
            away: true, farm, sentence: awaySentence(farm),
            ...(d.lastSeen() ? { since: d.lastSeen() } : {}),
            ...(opened.at ? { openedAt: opened.at } : {}),
            snapshot: snap ?? null,
            ...(ts !== undefined ? { age: snapshotAge({ ts, writer: 'service' }, d.now()) } : {})
        } };
    }
    if (op === 'farm.open') {
        const now = d.now();
        if (opened.at && now - opened.at < OPEN_AGAIN_MS) { return { ok: true, result: { opening: true, again: true, since: opened.at } }; }
        const exe = d.config()?.codeExe ?? '';
        if (!exe || !fs.existsSync(exe)) { return { ok: false, error: `VS Code cannot be started from here: ${exe ? `${exe} is not there any more` : 'VS Code has not told the service where it is'} — open it on ${farm} once.` }; }
        try { d.launch(exe, openEnv(process.env)); } catch (e) { return { ok: false, error: `VS Code did not start: ${String((e as Error)?.message ?? e)}` }; }
        opened.at = now;
        d.log(`remote: a phone asked to open Agent Farm - started ${exe}`);
        return { ok: true, result: { opening: true, exe } };
    }
    return { ok: false, error: awaySentence(farm) };
}

export interface ServiceRemoteDeps {
    storageDir: string;
    heartbeatFile: string;
    snapshotFile: string;
    resourceDir: string;
    log: (line: string) => void;
    start: (port: RemotePort, at: ListenAt) => Promise<RunningRemote>;
    farm: (remoteDir: string) => FarmIdentity;
    net?: () => NetTable;
    now?: () => number;
    launch?: (exe: string, env: NodeJS.ProcessEnv) => void;
}

const readJson = (file: string): Record<string, unknown> | undefined => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>; } catch { return undefined; }
};

export class ServiceRemote {
    private running: RunningRemote | null = null;
    private key = '';
    private busy = false;
    private said = '';
    private readonly opened: { at?: number } = {};
    private readonly remoteDir: string;

    constructor(private readonly d: ServiceRemoteDeps) { this.remoteDir = path.join(d.storageDir, 'remote'); }

    get listening(): boolean { return !!this.running; }

    /** One tick: host while VS Code is away and the phone is on, hand back otherwise. */
    async sync(alive: boolean): Promise<void> {
        if (this.busy) { return; }
        this.busy = true;
        try {
            const cfg = readRemoteConfig(path.join(this.d.storageDir, REMOTE_CONFIG_FILE));
            const t = awayTarget(cfg, alive, (this.d.net ?? os.networkInterfaces as () => NetTable)());
            const key = 'at' in t ? `${t.at.host}:${t.at.port}` : '';
            if (this.running && key !== this.key) {
                const r = this.running;
                this.running = null;
                await r.stop();
                this.d.log(alive ? 'remote: phone host handed back to VS Code' : 'remote: phone host stopped (its address changed or the phone was turned off)');
            }
            if (!('at' in t) || this.running) { this.say('why' in t && !alive && cfg && cfg.mode !== 'off' ? `remote: phone host not started - ${t.why}` : ''); return; }
            try {
                this.running = await this.d.start(this.port(), t.at);
                this.key = key;
                this.opened.at = undefined;
                this.say('');
                this.d.log(`remote: VS Code is away - the service hosts the phone on ${key}`);
            } catch (e) { this.say(`remote: the service could not host the phone on ${key} - ${String((e as Error)?.message ?? e)}`); }
        } finally { this.busy = false; }
    }

    async stop(): Promise<void> {
        const r = this.running;
        this.running = null;
        if (r) { await r.stop(); }
    }

    private say(line: string): void {
        if (line && line !== this.said) { this.d.log(line); }
        this.said = line;
    }

    private port(): RemotePort {
        const farm = () => this.d.farm(this.remoteDir);
        const away: AwayDeps = {
            farm,
            config: () => readRemoteConfig(path.join(this.d.storageDir, REMOTE_CONFIG_FILE)),
            lastSeen: () => { try { const n = Number(fs.readFileSync(this.d.heartbeatFile, 'utf8').trim()); return Number.isFinite(n) && n > 0 ? n : undefined; } catch { return undefined; } },
            snapshot: () => readJson(this.d.snapshotFile),
            // a GUI program the person is to see: no console to flash, and hiding it would hide VS Code
            launch: this.d.launch ?? ((exe, env) => { cp.spawn(exe, [], { detached: true, stdio: 'ignore', env, windowsHide: false }).unref(); }),
            now: this.d.now ?? Date.now,
            log: this.d.log
        };
        return {
            farm,
            callOp: async op => { try { return awayCall(op, away, this.opened); } catch (e) { return { ok: false, error: String((e as Error)?.message ?? e) }; } },
            subscribe: () => () => { /* nothing happens while VS Code is away */ },
            can: f => (f === 'remote.access' ? { allowed: true }
                : { allowed: false, reason: isFeature(f) ? awaySentence(farm().name) : `unknown feature ${f}` }),
            storageDir: () => this.remoteDir,
            resourceDir: () => this.d.resourceDir,
            log: this.d.log
        };
    }
}
