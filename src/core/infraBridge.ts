import * as fs from 'fs';
import * as path from 'path';
import { AgentInfo } from './agents';
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { clearPort, portHolder } from './portScan';
import {
    hasOurHooks, hookCommand, installHooksInto, InstallResult, removeHooksFrom
} from './hooksInstaller';
import { PriceRule } from './pricing';

/**
 * Working-infrastructure bridge ops (B-8).
 *
 * ‼️ FOUR THINGS THE FARM RUNS ON THAT ONLY A HAND COULD TOUCH: the Claude live
 * hooks (without them the timeline sees nothing), the headless Windows service
 * (without it a schedule at 03:00 needs VS Code left open), the usage lap (the
 * "count from here" every measurement is read against) and the price of a model
 * nobody has priced (which is why a real run reads $0). Each of them is the
 * thing an agent asked to SET THE FARM UP has to be able to do.
 *
 * Two rules run through the whole file. Anything that changes the machine
 * itself — a scheduled task — answers with a PLAN by default and only acts on
 * `confirm:true`, and it is built as an argument vector rather than a command
 * line, so no path with a space or a quote in it can become a second command.
 * And the target is resolved and NAMED before anything is written: "which file
 * will this change" is the question a caller has to be able to ask first.
 */

/** The Windows Scheduled Task the headless service installs itself as. */
export const SERVICE_TASK_NAME = 'AgentFarmService';

export interface SchtasksResult { code: number; out: string; err: string }

export interface InfraBridgeDeps {
    getAgents(): AgentInfo[];
    /** ~/.claude/settings.json — the user-scope hook target */
    userSettingsFile(): string;
    /** the port the hooks POST to (agentFarm.livePort) */
    livePort(): number;
    /**
     * U-86 — bind the live listener again. `LiveMonitor.start()` stops first, so
     * this IS the reset; optional because a host that has no monitor (a test)
     * still registers every other op.
     */
    restartListener?(): void;
    /** globalStorage — where the service script, cmd, config and log live */
    storageDir(): string;
    /** the built service script inside the extension (out/service/farmService.js) */
    serviceSource(): string;
    /** write the service's config file — the same one the install command writes */
    writeServiceConfig(): void;
    /** run schtasks as an ARGV, never a command line */
    runSchtasks(args: string[]): Promise<SchtasksResult>;
    platform(): string;
    /** usage lap start, 0 = no lap */
    lapStart(): number;
    setLapStart(ts: number): void | Promise<void>;
    /** current model price rules, and the same write the pricing editor makes */
    pricingRules(): PriceRule[];
    setPricingRules(rules: PriceRule[]): void | Promise<void>;
    /** every model this farm has actually seen — the "no rule" list is drawn from it */
    seenModels(): string[];
}

export interface HookTarget {
    scope: 'user' | 'agent';
    agent?: string;
    file: string;
    installed: boolean;
}

/** Every file the live hooks can live in, and whether ours are in it. */
export function hookTargets(deps: InfraBridgeDeps): HookTarget[] {
    const user: HookTarget = {
        scope: 'user', file: deps.userSettingsFile(), installed: false
    };
    user.installed = hasOurHooks(user.file);
    return [user, ...deps.getAgents().map(a => {
        const file = path.join(a.dir, '.claude', 'settings.local.json');
        return { scope: 'agent' as const, agent: a.name, file, installed: hasOurHooks(file) };
    })];
}

/** The files the service install writes, in the order it writes them. */
export function serviceFiles(deps: InfraBridgeDeps): { script: string; cmd: string; log: string } {
    const storage = deps.storageDir();
    return {
        script: path.join(storage, 'farm-service.js'),
        cmd: path.join(storage, 'farm-service.cmd'),
        log: path.join(storage, 'farm-service.log')
    };
}

/** Is the scheduled task registered? `schtasks /query` is the only honest answer. */
export async function serviceState(deps: InfraBridgeDeps): Promise<{ installed: boolean; detail: string }> {
    const r = await deps.runSchtasks(['/query', '/tn', SERVICE_TASK_NAME, '/fo', 'LIST']);
    return { installed: r.code === 0, detail: (r.code === 0 ? r.out : r.err).trim().slice(0, 800) };
}

/** The argv that registers the logon task — never a command line. */
export function serviceInstallArgv(deps: InfraBridgeDeps): string[] {
    return ['/create', '/tn', SERVICE_TASK_NAME, '/sc', 'onlogon',
        '/tr', `"${serviceFiles(deps).cmd}"`, '/f'];
}

export interface ServiceInstallResult {
    installed: boolean; started: boolean; replaced: boolean;
    taskName: string; files: string[]; error?: string;
}

/**
 * Do the install for real. The command and the bridge op both come here, so
 * the file layout, the argv and the read-back check cannot drift apart.
 */
export async function installService(
    deps: InfraBridgeDeps, opts: { start?: boolean } = {}
): Promise<ServiceInstallResult> {
    const files = serviceFiles(deps);
    const before = await serviceState(deps);
    fs.mkdirSync(deps.storageDir(), { recursive: true });
    fs.copyFileSync(deps.serviceSource(), files.script);
    deps.writeServiceConfig();
    fs.writeFileSync(files.cmd,
        `@echo off\r\nnode "${files.script}" --storage "${deps.storageDir()}" >> "${files.log}" 2>&1\r\n`,
        'utf8');
    const made = await deps.runSchtasks(serviceInstallArgv(deps));
    if (made.code !== 0) {
        return {
            installed: false, started: false, replaced: before.installed,
            taskName: SERVICE_TASK_NAME, files: [files.script, files.cmd],
            error: (made.err || made.out).trim().slice(0, 300)
        };
    }
    let started = false;
    if (opts.start !== false) {
        started = (await deps.runSchtasks(['/run', '/tn', SERVICE_TASK_NAME])).code === 0;
    }
    // The install is only true if the task can be read back.
    const after = await serviceState(deps);
    return {
        installed: after.installed, started, replaced: before.installed,
        taskName: SERVICE_TASK_NAME, files: [files.script, files.cmd]
    };
}

/** Stop and unregister it. A task that is not there is "already gone", not a failure. */
export async function removeService(
    deps: InfraBridgeDeps
): Promise<{ removed: boolean; wasInstalled: boolean; detail: string | null }> {
    const before = await serviceState(deps);
    if (!before.installed) { return { removed: false, wasInstalled: false, detail: null }; }
    await deps.runSchtasks(['/end', '/tn', SERVICE_TASK_NAME]);
    const del = await deps.runSchtasks(['/delete', '/tn', SERVICE_TASK_NAME, '/f']);
    const after = await serviceState(deps);
    return {
        removed: !after.installed, wasInstalled: true,
        detail: del.code === 0 ? null : (del.err || del.out).trim().slice(0, 300)
    };
}

export function registerInfraOps(bridge: BridgeRegistry, deps: InfraBridgeDeps): void {
    /** Which hook files a call means — resolved and named BEFORE anything is written. */
    const resolveTargets = (args: Record<string, unknown>): HookTarget[] => {
        const all = hookTargets(deps);
        const agentRef = optStr(args, 'agent');
        if (agentRef) {
            const a = deps.getAgents().find(x =>
                x.id === agentRef || x.name.toLowerCase() === agentRef.toLowerCase());
            need(a, `Agent "${agentRef}" not found — agents.list shows the current farm.`);
            const t = all.find(x => x.agent === (a as AgentInfo).name);
            return t ? [t] : [];
        }
        const scope = (optStr(args, 'scope') || 'user').toLowerCase();
        need(['user', 'agents', 'both'].includes(scope),
            `scope is user, agents or both — not "${scope}"`);
        if (scope === 'user') { return all.filter(t => t.scope === 'user'); }
        if (scope === 'agents') { return all.filter(t => t.scope === 'agent'); }
        return all;
    };

    const windowsOnly = (): void => {
        need(deps.platform() === 'win32',
            `The headless service is a Windows Scheduled Task — this machine is ${deps.platform()}. There is nothing to install here.`);
    };

    const serviceInstalled = (): Promise<{ installed: boolean; detail: string }> => serviceState(deps);

    bridge.register([
        {
            op: 'hooks.status',
            describe: 'Where the Claude live hooks stand, per file. Without them the extension is BLIND — no timeline, no permission-wait notice, no live turn — and the commonest cause of "nothing shows up" is that they were never installed, or were installed for one agent and not the farm. USER scope is one file that covers every session on this machine; AGENT scope is one file per agent folder. args: none',
            handler: () => {
                const targets = hookTargets(deps);
                const port = deps.livePort();
                return {
                    port, command: hookCommand(port),
                    installed: targets.filter(t => t.installed).length,
                    targets,
                    note: targets.some(t => t.scope === 'user' && t.installed)
                        ? 'User scope is installed — every session on this machine is covered.'
                        : 'User scope is NOT installed; only the agent files listed as installed report events.'
                };
            }
        },
        {
            op: 'hooks.port',
            describe: '‼️ WHO HOLDS THE LIVE PORT — the answer "the hooks are installed but nothing arrives" usually needs. Returns the process listening on agentFarm.livePort, CLASSIFIED: `ours` (this window, which is not a conflict), `other-window` (a second VS Code — the hooks are reaching that one), `stranger` (the only case stopping it is offered for), `none`, or `unknown` when the scan could not answer. Never guesses: a scan that fails says so rather than reporting a free port. args: none',
            handler: () => portHolder(deps.livePort())
        },
        {
            op: 'hooks.port.clear',
            describe: '‼️ STOP WHATEVER HOLDS THE LIVE PORT, then bind again. REFUSED unless hooks.port classified the holder as `stranger` — this extension will not stop its own window, and it will not kill a second VS Code somebody is working in. `dryRun:true` answers with who would be stopped and stops nothing. args: dryRun?',
            handler: (args) => {
                const holder = portHolder(deps.livePort());
                if (args.dryRun === true) {
                    return { dryRun: true, holder, wouldStop: holder.canStop ? holder.pid : null };
                }
                need(holder.canStop,
                    `Refused — ${holder.detail} Nothing was stopped.`);
                const r = clearPort(deps.livePort());
                need(r.ok, r.error ?? 'the process could not be stopped');
                deps.restartListener?.();
                return { stopped: r.stopped, holder, note: 'The listener was asked to bind again.' };
            }
        },
        {
            op: 'hooks.listener.restart',
            describe: 'Bind the live listener again — the safe half of a port repair, and the one to try first after freeing a port or changing agentFarm.livePort. Stops the current listener and starts it, so it is idempotent. args: none',
            handler: () => {
                need(!!deps.restartListener, 'This window has no live monitor to restart.');
                deps.restartListener?.();
                return { port: deps.livePort(), note: 'The listener was asked to bind again.' };
            }
        },
        {
            op: 'hooks.install',
            describe: '‼️ MERGE THE LIVE HOOKS INTO A CLAUDE SETTINGS FILE — the one setup step the extension cannot do for itself. `scope:"user"` (the default) is the one to want: one file, every session. `scope:"agents"` writes each agent\'s .claude/settings.local.json, `agent` names just one, `both` does the lot. Existing settings are preserved and a one-time .agentfarm-bak copy is made beside each file. Running claude sessions must be restarted before the hooks fire. `dryRun:true` answers with the exact files and nothing else. args: scope? (user|agents|both, default user), agent? (name|id — one agent), dryRun?',
            handler: (args) => {
                const targets = resolveTargets(args);
                need(targets.length, 'No target files — the farm has no agents to install into.');
                const port = deps.livePort();
                if (args.dryRun === true) {
                    return {
                        dryRun: true, port, command: hookCommand(port),
                        files: targets.map(t => ({ ...t })),
                        note: `${targets.length} file(s) would be written; nothing has changed.`
                    };
                }
                const results: InstallResult[] = targets.map(t => installHooksInto(t.file, port));
                const failed = results.filter(r => !r.ok);
                return {
                    port, installed: results.filter(r => r.ok).length,
                    failed: failed.length,
                    files: results.map(r => ({ file: r.file, ok: r.ok, action: r.action, error: r.error ?? null })),
                    note: (failed.length
                        ? `${failed.length} file(s) could not be written — ${failed.map(f => `${f.file} (${f.error})`).join('; ')}. `
                        : '')
                        + 'Restart any running claude session before expecting events.'
                };
            }
        },
        {
            op: 'hooks.remove',
            describe: 'Take Agent Farm\'s own hook entries back out of the settings files, leaving every foreign hook where it is. Files that never had ours are skipped rather than rewritten, so this is idempotent — a second call removes nothing and says so. args: scope? (user|agents|both, default both), agent? (name|id), dryRun?',
            handler: (args) => {
                const scoped = optStr(args, 'scope') || optStr(args, 'agent')
                    ? resolveTargets(args)
                    : hookTargets(deps);
                const targets = scoped.filter(t => t.installed);
                if (!targets.length) {
                    return { removed: 0, files: [], note: 'No Agent Farm hooks in those files — nothing to remove.' };
                }
                if (args.dryRun === true) {
                    return {
                        dryRun: true, files: targets.map(t => ({ ...t })),
                        note: `${targets.length} file(s) would be cleaned; nothing has changed.`
                    };
                }
                const done = targets.map(t => ({ file: t.file, ok: !!removeHooksFrom(t.file)?.ok }));
                return {
                    removed: done.filter(d => d.ok).length, files: done,
                    note: `Removed from ${done.filter(d => d.ok).length} of ${done.length} file(s).`
                };
            }
        },
        {
            op: 'service.status',
            describe: 'The headless service: a Windows Scheduled Task that runs a small node process at logon so schedules and watch-triggers keep firing WHILE VS CODE IS CLOSED (it goes idle whenever a window is open). This says whether the task exists, what it is called, and which files back it. On anything other than Windows it says so plainly rather than pretending. args: none',
            handler: async () => {
                const files = serviceFiles(deps);
                if (deps.platform() !== 'win32') {
                    return {
                        supported: false, platform: deps.platform(), installed: false,
                        taskName: SERVICE_TASK_NAME,
                        note: 'The headless service is a Windows Scheduled Task — this platform has no equivalent here.'
                    };
                }
                const { installed, detail } = await serviceInstalled();
                return {
                    supported: true, platform: 'win32', installed, taskName: SERVICE_TASK_NAME,
                    files: {
                        ...files,
                        scriptPresent: fs.existsSync(files.script),
                        cmdPresent: fs.existsSync(files.cmd)
                    },
                    detail,
                    note: installed
                        ? `"${SERVICE_TASK_NAME}" is registered; it takes over when VS Code closes.`
                        : `"${SERVICE_TASK_NAME}" is not registered — schedules only fire while a window is open.`
                };
            }
        },
        {
            op: 'service.install',
            describe: '‼️ CHANGES THE MACHINE, SO IT PLANS FIRST. Called bare it returns the whole plan — the exact scheduled-task name, every file it will write, whether the task is already there — and does NOTHING. Only `confirm:true` registers the logon task and starts it. Re-running it is safe: schtasks is called with /f, so an existing task is replaced rather than duplicated. Requires node on PATH and Windows; anything else is refused, not half-done. args: confirm? (default false = plan only), start? (default true — run it immediately once registered)',
            handler: async (args) => {
                windowsOnly();
                const files = serviceFiles(deps);
                const src = deps.serviceSource();
                need(fs.existsSync(src),
                    'The service script is missing from this build (out/service/farmService.js) — reinstall the extension.');
                const before = await serviceInstalled();
                if (args.confirm !== true) {
                    return {
                        planned: true, taskName: SERVICE_TASK_NAME, alreadyInstalled: before.installed,
                        writes: [files.script, files.cmd, path.join(deps.storageDir(), 'farm-service.json')],
                        schtasks: serviceInstallArgv(deps), from: src,
                        note: 'Nothing was changed. Pass confirm:true to register the task.'
                    };
                }
                const done = await installService(deps, { start: args.start !== false });
                need(!done.error, `schtasks refused to register the task — ${done.error}`);
                return {
                    installed: done.installed, started: done.started, taskName: done.taskName,
                    files: done.files, replaced: done.replaced,
                    note: done.installed
                        ? `"${SERVICE_TASK_NAME}" is registered${done.started ? ' and running' : ''} — it takes over when VS Code closes.`
                        : 'schtasks reported success but the task cannot be read back — check Task Scheduler.'
                };
            }
        },
        {
            op: 'service.remove',
            describe: 'Stop and unregister the headless service. Same bargain as service.install: bare it PLANS, `confirm:true` acts. A task that is not there is reported as already gone rather than failing, so this is idempotent. The files in globalStorage are left alone — they cost nothing and are what a re-install copies. args: confirm? (default false = plan only)',
            handler: async (args) => {
                windowsOnly();
                const before = await serviceInstalled();
                if (args.confirm !== true) {
                    return {
                        planned: true, taskName: SERVICE_TASK_NAME, installed: before.installed,
                        schtasks: [['/end', '/tn', SERVICE_TASK_NAME], ['/delete', '/tn', SERVICE_TASK_NAME, '/f']],
                        note: before.installed
                            ? 'Nothing was changed. Pass confirm:true to stop and unregister it.'
                            : 'It is not registered — confirm:true would change nothing.'
                    };
                }
                const gone = await removeService(deps);
                return {
                    removed: gone.removed, taskName: SERVICE_TASK_NAME, detail: gone.detail,
                    note: !gone.wasInstalled ? 'It was not registered — nothing to remove.'
                        : gone.removed ? 'Stopped and unregistered.'
                            : 'The task is still registered — schtasks refused the delete.'
                };
            }
        },
        {
            op: 'usage.lap',
            describe: 'The token LAP — the "count from here" mark every usage figure on the status bar and the plan card is read against. With no lap, the figures are all-time; with one, they answer "what has this session of work cost me". This reads it. args: none',
            handler: () => {
                const from = deps.lapStart();
                return {
                    running: from > 0, from: from || null,
                    since: from ? new Date(from).toISOString() : null,
                    note: from
                        ? `Counting from ${new Date(from).toISOString()}.`
                        : 'No lap — the figures are all-time.'
                };
            }
        },
        {
            op: 'usage.lap.reset',
            describe: 'Start the lap HERE — from now, or from an explicit moment. This is the gesture before a measured piece of work: reset, do the thing, read what it cost. args: at? (epoch ms — default now)',
            handler: async (args) => {
                const at = args.at === undefined || args.at === null || args.at === ''
                    ? Date.now() : Number(args.at);
                need(Number.isFinite(at) && at > 0, '`at` is an epoch-milliseconds timestamp.');
                need(at <= Date.now() + 60_000, 'A lap cannot start in the future — the figures before it would be nothing.');
                const was = deps.lapStart();
                await deps.setLapStart(Math.trunc(at));
                return {
                    from: Math.trunc(at), since: new Date(Math.trunc(at)).toISOString(),
                    previous: was || null,
                    note: `Counting from ${new Date(Math.trunc(at)).toISOString()}.`
                };
            }
        },
        {
            op: 'usage.lap.clear',
            describe: 'End the lap — the usage figures go back to all-time. Calling it with no lap running changes nothing and says so. args: none',
            handler: async () => {
                const was = deps.lapStart();
                if (!was) { return { cleared: false, note: 'There was no lap — the figures were already all-time.' }; }
                await deps.setLapStart(0);
                return { cleared: true, was, note: 'Lap cleared — the figures are all-time again.' };
            }
        },
        {
            op: 'pricing.rules',
            describe: '‼️ WHAT EACH MODEL COSTS, AND WHICH ONES COST NOTHING BECAUSE NOBODY SAID. Rules are regexes over the model name, in order — the FIRST match wins — in USD per 1M tokens. `unpriced` is the list this op exists for: a model this farm has really run that matches no rule is billed at $0, so a real spend reads as free and every cost figure above it is quietly wrong. args: none',
            handler: () => {
                const rules = deps.pricingRules();
                const matches = (m: string, pat: string): boolean => {
                    try { return new RegExp(pat, 'i').test(m); } catch { return false; }
                };
                const seen = deps.seenModels();
                const unpriced = seen.filter(m => !rules.some(r => matches(m, r.match)));
                return {
                    rules, seen: seen.length, unpriced,
                    note: unpriced.length
                        ? `${unpriced.length} model(s) this farm has run are counted as $0 — pricing.set gives them a rate: ${unpriced.join(', ')}`
                        : 'Every model seen here matches a rule.'
                };
            }
        },
        {
            op: 'pricing.set',
            describe: '‼️ PRICE A MODEL. One rule at a time (`match` + the four rates) UPSERTS by its match, which is the answer to pricing.rules → unpriced; `rules` replaces the whole set at once, for restoring a known table. Rates are USD per 1M tokens and default to 0 when omitted. The match is a REGEX and is compiled before anything is saved — a broken one is refused rather than silently never matching. ‼️ Saving prices from NOW: earlier sessions keep the rate they were recorded at, which is why a correction never rewrites history. args: match? + input? + output? + cacheWrite? + cacheRead?  ·  or rules? (the whole array)',
            handler: async (args) => {
                const clean = (r: Record<string, unknown>): PriceRule => {
                    const match = String(r.match ?? '').trim();
                    need(match, 'A price rule needs a `match` — the regex for the model name.');
                    try { new RegExp(match, 'i'); }
                    catch (e) { need(false, `"${match}" is not a valid regex — ${String(e)}`); }
                    const num = (k: string): number => {
                        const v = r[k];
                        if (v === undefined || v === null || v === '') { return 0; }
                        const n = Number(v);
                        need(Number.isFinite(n) && n >= 0, `${k} is a non-negative number of USD per 1M tokens — not "${String(v)}"`);
                        return n;
                    };
                    return {
                        match, input: num('input'), output: num('output'),
                        cacheWrite: num('cacheWrite'), cacheRead: num('cacheRead')
                    };
                };
                if (Array.isArray(args.rules)) {
                    const rules = (args.rules as Record<string, unknown>[]).map(clean);
                    need(rules.length, 'An empty rule set would price every model at $0 — pass at least one rule.');
                    await deps.setPricingRules(rules);
                    return { replaced: true, rules, note: `${rules.length} rule(s) saved — they apply from now on.` };
                }
                const one = clean(args as Record<string, unknown>);
                const rules = deps.pricingRules().slice();
                const at = rules.findIndex(r => r.match === one.match);
                if (at >= 0) { rules[at] = one; } else { rules.push(one); }
                await deps.setPricingRules(rules);
                return {
                    added: at < 0, updated: at >= 0, rule: one, rules: rules.length,
                    note: `"${one.match}" is now $${one.input}/$${one.output} per 1M in/out — from now on; earlier costs stay as recorded.`
                };
            }
        }
    ]);
}
