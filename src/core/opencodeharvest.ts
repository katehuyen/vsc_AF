/**
 * S-33 — THE PART THAT COSTS A PROCESS, KEPT AWAY FROM EVERYTHING THAT DRAWS.
 *
 * `SessionSource.scan()` is synchronous and is called whenever a panel repaints.
 * OpenCode's history is only reachable by SPAWNING (`session list`, `export`),
 * and this machine is an i7-2600K — a scan that shelled out would put a process
 * per agent folder behind every repaint. So the two halves are separated by a
 * FILE: this harvester runs on its own clock, writes each conversation's export
 * into a cache directory, and `cliTranscripts.ts` reads that directory the same
 * cheap way it reads every other engine's transcripts.
 *
 * ‼️ THE CACHE IS THE ENGINE'S OWN DOCUMENT, UNEDITED. What lands on disk is
 * exactly what `opencode export` printed, so a reader three months from now can
 * hold it against the CLI and see whether Agent Farm's reading or the engine's
 * output changed. Nothing here writes to OpenCode's store: `export` and `session
 * list` are reads, and deleting a conversation is a separate, explicitly
 * confirmed action that lives in `extension.ts`.
 *
 * Pure over an injected runner — the class never imports `child_process`. The
 * node adaptor is `nodeOpencodeCli()` at the bottom, the same split
 * `consolehost.ts` uses for the ACP runtime.
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { OPENCODE_EXE, OPENCODE_SESSION_ID } from './opencode';
import { NO_MODELS_FETCH } from './opencodeCacheTemps';
import {
    OpencodeListRow, opencodeExportsToRefresh, opencodeListJson, opencodeMergeRows
} from './opencodehistory';

/** One CLI call, as this harvester needs it: text out, or a reason it failed. */
export interface OpencodeCli {
    run(args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; error?: string }>;
}

/** How long a list or an export may take before it is abandoned. A spawn that
 *  hangs must not hold the harvest open for the next one. */
export const HARVEST_TIMEOUT_MS = 25_000;

/** The quiet floor between two automatic harvests. A user-triggered refresh
 *  ignores it — that is what makes the button mean something. */
export const HARVEST_MIN_MS = 5 * 60_000;

/** How many folders one pass will list from. The store is machine-wide, so
 *  every root answers with the same conversations for the projects it can see;
 *  past this the extra spawns buy repeats. */
export const HARVEST_MAX_ROOTS = 24;

/** How many conversations one pass will export. A first run on a long history
 *  catches up over successive passes, newest first. */
export const HARVEST_MAX_EXPORTS = 12;

/** …and how many of those run at once. Two, deliberately: this is a background
 *  errand on a machine the user is working on. */
export const HARVEST_CONCURRENCY = 2;

/**
 * ‼️ S-39 — WHY A HARVEST FAILED, WHICH `failed: 20` COULD NOT SAY.
 *
 * The count was reached from four different places — a listing that would not
 * run, an export that would not run, an export whose output could not be found,
 * and a write that threw — and every one of them incremented the same number.
 * A failure that is only ever counted cannot be diagnosed: the measurement that
 * closed this item had to be done by hand, outside the extension, because the
 * extension had thrown the reason away. It is kept now, capped, and it is the
 * first thing the panel and `sessions.opencodeSync` report.
 */
export interface HarvestFailure {
    /** which part of the errand: a listing, or one conversation's export */
    stage: 'list' | 'export' | 'read' | 'write';
    /** the folder a listing ran in, or the conversation an export was for */
    where: string;
    reason: string;
}

/** How many reasons one result will carry. Enough to see the PATTERN — the
 *  twentieth is the same sentence as the fourth — without turning a background
 *  errand's answer into a log file. */
export const HARVEST_MAX_FAILURES = 8;

export interface HarvestResult {
    /** false when the floor held it back — nothing was spawned */
    ran: boolean;
    roots: number;
    /** distinct conversations the listings knew about */
    listed: number;
    exported: number;
    failed: number;
    /** ‼️ S-39 — the reasons behind `failed`, newest first, capped at
     *  HARVEST_MAX_FAILURES. Empty when nothing failed. */
    failures: HarvestFailure[];
    /**
     * ‼️ S-39 — folders that were NOT spawned in because they no longer exist,
     * which is neither a failure nor a silence: measured, nine of this machine's
     * learned roots were `%TEMP%\af-oc-contract-*` directories from a previous
     * measuring run, deleted the moment it ended. Spawning in a folder that is
     * gone costs two seconds and produces an error that says nothing about
     * OpenCode. Counting them separately keeps `failed` meaning "something went
     * wrong" rather than "this machine has moved on".
     */
    skippedRoots: number;
    /** the reason nothing could be done at all, if there is one */
    error?: string;
}

export interface OpencodeHarvesterOptions {
    /** where the cached exports live — one `<ses_id>.json` per conversation */
    dir: () => string;
    /** the folders to list from: the agents' roots, the open workspace, and the
     *  directories previous listings already named (see `roots()` below) */
    roots: () => string[];
    cli: OpencodeCli;
    /** false switches the whole errand off without unwiring it */
    enabled: () => boolean;
    now?: () => number;
}

export class OpencodeHarvester {
    private lastRun = 0;
    private running = false;
    /** folders a listing has already attributed a conversation to. The store is
     *  machine-wide but the LISTING is cwd-scoped (measured), so a project the
     *  user has no agent registered in would otherwise be invisible for ever —
     *  once one of its sessions is seen, its folder joins the walk. */
    private learned = new Set<string>();

    constructor(private readonly o: OpencodeHarvesterOptions) {}

    private now(): number { return this.o.now ? this.o.now() : Date.now(); }

    /** Every folder worth listing from, most specific first, capped. */
    roots(): string[] { return this.walk().roots; }

    /**
     * ‼️ S-39 — …AND A FOLDER THAT IS NO LONGER THERE IS NOT ONE OF THEM.
     *
     * `learned` grows from the `directory` of every conversation a listing
     * names, and a conversation outlives its folder: measured on this machine,
     * nine of the learned roots were `%TEMP%\af-oc-contract-*` directories a
     * previous measuring run had created and deleted. Each one cost a spawn
     * that could only fail, and the failure was counted as OpenCode's.
     *
     * Dropping them is also what makes the cap mean something — the walk stops
     * at HARVEST_MAX_ROOTS, so a dead folder near the front of the list was
     * pushing a live one off the end.
     */
    private walk(): { roots: string[]; gone: number } {
        const seen = new Set<string>();
        const out: string[] = [];
        let gone = 0;
        for (const r of [...this.o.roots(), ...this.learned]) {
            const clean = String(r ?? '').trim();
            if (!clean) { continue; }
            const key = clean.toLowerCase();
            if (seen.has(key)) { continue; }
            seen.add(key);
            // ‼️ A stat, not a spawn. The check that replaces a two-second
            // process is the cheapest call in this file.
            if (!this.exists(clean)) { gone++; continue; }
            out.push(clean);
            if (out.length >= HARVEST_MAX_ROOTS) { break; }
        }
        return { roots: out, gone };
    }

    private exists(dir: string): boolean {
        try { return fs.statSync(dir).isDirectory(); } catch { return false; }
    }

    /** What the cache already holds, and WHEN each piece was written.
     *
     *  ‼️ The write time is the whole freshness rule. We write immediately after
     *  listing, so our stamp is always later than the engine's `updated` for a
     *  conversation that has not moved since — and earlier for one that has.
     *  Both are epoch ms on one machine; nothing is compared across clocks. */
    private cached(): Map<string, number> {
        const out = new Map<string, number>();
        const dir = this.o.dir();
        if (!dir) { return out; }
        let names: string[] = [];
        try { names = fs.readdirSync(dir); } catch { return out; }
        for (const name of names) {
            if (!name.endsWith('.json')) { continue; }
            const id = name.slice(0, -5);
            if (!OPENCODE_SESSION_ID.test(id)) { continue; }
            try { out.set(id, fs.statSync(path.join(dir, name)).mtimeMs); } catch { /* gone */ }
        }
        return out;
    }

    /**
     * List from every root, export what has moved, write it to the cache.
     *
     * `force` is the user's own refresh: it ignores the quiet floor, because a
     * button that might do nothing is worse than no button. Two harvests never
     * overlap — the second is answered `ran: false` rather than queued.
     */
    async harvest(force = false): Promise<HarvestResult> {
        const blank: HarvestResult = {
            ran: false, roots: 0, listed: 0, exported: 0, failed: 0,
            failures: [], skippedRoots: 0
        };
        if (!this.o.enabled()) { return blank; }
        if (this.running) { return blank; }
        const now = this.now();
        if (!force && now - this.lastRun < HARVEST_MIN_MS) { return blank; }
        const dir = this.o.dir();
        if (!dir) { return { ...blank, error: 'no cache directory' }; }
        this.running = true;
        this.lastRun = now;
        try {
            try { fs.mkdirSync(dir, { recursive: true }); }
            catch (e) { return { ...blank, ran: true, error: String((e as Error)?.message ?? e) }; }

            const walked = this.walk();
            const roots = walked.roots;
            const lists: OpencodeListRow[][] = [];
            let failed = 0;
            const failures: HarvestFailure[] = [];
            const note = (stage: HarvestFailure['stage'], where: string, reason: string) => {
                failed++;
                if (failures.length < HARVEST_MAX_FAILURES) {
                    failures.push({ stage, where, reason: reason || 'no reason given' });
                }
            };
            await this.pool(roots, async root => {
                const r = await this.o.cli.run(
                    ['session', 'list', '--format', 'json'], root, HARVEST_TIMEOUT_MS);
                // ‼️ A ROOT THAT ANSWERS NOTHING IS NOT A FAILURE. Measured: one
                // directory away from the project, the listing is empty — that
                // is the cwd scoping working, not an error, and counting it as
                // one would make every harvest look broken.
                if (r.error) { note('list', root, r.error); return; }
                lists.push(opencodeListJson(r.stdout));
            });
            const rows = opencodeMergeRows(lists);
            for (const row of rows) {
                if (row.directory) { this.learned.add(row.directory); }
            }
            const wanted = opencodeExportsToRefresh(rows, this.cached(), HARVEST_MAX_EXPORTS);
            const byId = new Map(rows.map(r => [r.id, r]));
            let exported = 0;
            await this.pool(wanted, async id => {
                if (!OPENCODE_SESSION_ID.test(id)) { return; }
                // ‼️ S-39 — THE CONVERSATION'S OWN FOLDER, BUT ONLY IF IT IS
                // STILL THERE. `export` was handed the directory the listing
                // named, and a conversation outlives its folder — so every
                // export of a run from a deleted temp folder failed, which is
                // the whole of this machine's `exported: 0`. MEASURED: the
                // store is machine-wide and `opencode export <id>` run from an
                // unrelated live folder returns that conversation in full
                // (exit 0, valid JSON). The cwd only has to EXIST.
                const own = byId.get(id)?.directory;
                const cwd = (own && this.exists(own) ? own : roots[0]) || '';
                const r = await this.o.cli.run(['export', id], cwd, HARVEST_TIMEOUT_MS);
                if (r.error) { note('export', id, r.error); return; }
                // The banner goes to stderr on 1.18.18, but a build that moves
                // it back must not write a file that will not parse.
                const start = r.stdout.indexOf('{');
                if (start < 0) {
                    note('read', id, 'the export printed no JSON object');
                    return;
                }
                try {
                    fs.writeFileSync(path.join(dir, `${id}.json`), r.stdout.slice(start), 'utf8');
                    exported++;
                } catch (e) { note('write', id, String((e as Error)?.message ?? e)); }
            });
            return {
                ran: true, roots: roots.length, listed: rows.length, exported, failed,
                failures, skippedRoots: walked.gone
            };
        } finally {
            this.running = false;
        }
    }

    /** Bounded parallelism, without a dependency. */
    private async pool<T>(items: T[], job: (item: T) => Promise<void>): Promise<void> {
        let next = 0;
        const workers = new Array(Math.min(HARVEST_CONCURRENCY, items.length || 1))
            .fill(0).map(async () => {
                for (;;) {
                    const i = next++;
                    if (i >= items.length) { return; }
                    try { await job(items[i]); } catch { /* fail-soft: one item */ }
                }
            });
        await Promise.all(workers);
    }
}

/**
 * The real CLI. `shell: true` because `opencode` is an npm `.cmd` shim on
 * Windows — and safe here for the reason `opencode.ts` states: nothing
 * user-typed reaches this command line. The only variable argument is a session
 * id, and the caller checks it against `OPENCODE_SESSION_ID` first.
 */
export function nodeOpencodeCli(exe = OPENCODE_EXE): OpencodeCli {
    return {
        run(args, cwd, timeoutMs) {
            return new Promise(resolve => {
                let done = false;
                const finish = (r: { stdout: string; error?: string }) => {
                    if (done) { return; }
                    done = true;
                    clearTimeout(timer);
                    resolve(r);
                };
                let child: cp.ChildProcess;
                try {
                    child = cp.spawn(exe, args, {
                        cwd: cwd || undefined, shell: true, windowsHide: true,
                        stdio: ['ignore', 'pipe', 'pipe'],
                        // X-528 — a list or an export only reads the store: no catalog refresh to cut off half-written
                        env: { ...process.env, ...NO_MODELS_FETCH }
                    });
                } catch (e) {
                    return resolve({ stdout: '', error: String((e as Error)?.message ?? e) });
                }
                const timer = setTimeout(() => {
                    try { child.kill(); } catch { /* already gone */ }
                    finish({ stdout: '', error: `timed out after ${timeoutMs} ms` });
                }, timeoutMs);
                let stdout = '', stderr = '';
                child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
                // stderr carries `Exporting session: ses_…` on a SUCCESSFUL run
                // (measured), so it is diagnosis only and never a failure signal.
                child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
                child.on('error', e => finish({ stdout: '', error: String(e?.message ?? e) }));
                child.on('close', code => finish(code === 0
                    ? { stdout }
                    : { stdout, error: stderr.trim().split('\n').pop() || `exit ${code}` }));
            });
        }
    };
}
