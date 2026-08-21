/**
 * ‼️ S-43 — THE PROCESS THAT MUST DIE IS NOT THE ONE YOU CAN SEE.
 *
 * Claude Code v2.1+ runs a daemon that keeps one pre-warmed worker ready. The
 * CLI registry names the WORKER — that is the pid Agent Farm has always killed
 * — and on Windows `taskkill /T` walks DOWN a tree, never up. So stopping a
 * session killed a leaf, its parent daemon noticed and bred another worker
 * under a new id, and the card came back: the loop the user could not get out
 * of without leaving the editor.
 *
 * Ending that for real means aiming at the TOP of the claude tree instead. Two
 * halves, deliberately separate: reading the machine's process table (one
 * spawn, only ever on an explicit press) and deciding where to aim (pure, so
 * the decision is testable against a table written by hand — which is the only
 * way to test a rule whose failure mode is killing the wrong thing).
 *
 * ‼️ THE CLIMB IS BOUNDED THREE WAYS, and every one of them is a safety rule
 * rather than a tidiness one:
 *   1. it never enters OUR OWN ancestry — the extension host is a process with
 *      a parent too, and a rule that climbed far enough would reach VS Code;
 *   2. it only climbs THROUGH a process that is recognisably part of a claude
 *      tree, so a session started from a terminal stops at the topmost claude
 *      and never touches the shell that opened it;
 *   3. it gives up after a fixed depth, because a table with a cycle in it
 *      (a reused pid mid-scan) must not become an infinite loop.
 */
import * as cp from 'child_process';

export interface ProcInfo {
    pid: number;
    ppid: number;
    /** Executable name as the OS reports it, e.g. `claude.exe`. */
    name: string;
}

/** Where a climb stopped, so the user can be told what will and will not go. */
export type ClimbStop = 'no-parent' | 'foreign-parent' | 'own-tree' | 'depth';

export interface KillTarget {
    /** The pid to aim `taskkill /T` at — the leaf itself if nothing above it qualified. */
    root: number;
    /** Leaf first, root last: what the confirmation shows. */
    chain: ProcInfo[];
    stop: ClimbStop;
}

/** Nothing above this is ever climbed — a table with a cycle must terminate. */
const MAX_DEPTH = 16;

/**
 * Is this process part of a claude tree — something we may climb THROUGH?
 *
 * Deliberately narrow. `claude` covers the CLI and the daemon it runs;
 * `node` covers a claude installed as a plain node script. A shell, a terminal
 * host or an editor is not on this list, which is what stops the climb at the
 * top of the claude tree rather than at the top of the machine.
 */
export function isClaudeProcess(name: string): boolean {
    const n = String(name || '').toLowerCase().replace(/\.exe$/, '');
    return n === 'claude' || n === 'node';
}

/** Every pid from `pid` up to the top of the table, `pid` included. Bounded. */
export function ancestorsOf(pid: number, table: ProcInfo[]): Set<number> {
    const by = new Map(table.map(p => [p.pid, p]));
    const out = new Set<number>();
    let cur = pid;
    for (let i = 0; i < MAX_DEPTH && cur > 0 && !out.has(cur); i++) {
        out.add(cur);
        cur = by.get(cur)?.ppid ?? 0;
    }
    return out;
}

/**
 * The highest process in the claude tree above `leaf` that it is safe to kill.
 *
 * `protect` is the set the climb must never enter — in production our own
 * process and everything above it. Passing it in rather than reading
 * `process.pid` here is what lets a test state the dangerous case (the leaf's
 * grandparent IS the editor) and prove the climb refuses it.
 */
export function findKillTarget(leaf: number, table: ProcInfo[], protect: Set<number>): KillTarget {
    const by = new Map(table.map(p => [p.pid, p]));
    const self = by.get(leaf) ?? { pid: leaf, ppid: 0, name: '' };
    const chain: ProcInfo[] = [self];
    let stop: ClimbStop = 'no-parent';
    let cur = self;
    for (let i = 0; i < MAX_DEPTH; i++) {
        // pid 0 and 4 are the kernel's own; a parent that is not in the table
        // is a process that has already exited (this is how an orphan looks).
        const parent = cur.ppid > 4 ? by.get(cur.ppid) : undefined;
        if (!parent) { stop = 'no-parent'; break; }
        if (protect.has(parent.pid)) { stop = 'own-tree'; break; }
        if (!isClaudeProcess(parent.name)) { stop = 'foreign-parent'; break; }
        chain.push(parent);
        cur = parent;
        if (i === MAX_DEPTH - 1) { stop = 'depth'; }
    }
    return { root: cur.pid, chain, stop };
}

/**
 * The machine's process table.
 *
 * One spawn, run only when somebody presses Force Kill. On Windows this is
 * PowerShell rather than `wmic`: `wmic` is deprecated and absent from recent
 * builds, and a tool that is missing on the newer machine is a feature that
 * works until it does not. Never throws — an empty table simply means the
 * climb has nothing to climb and the leaf is the target, which is the old
 * behaviour.
 */
export function readProcessTable(): ProcInfo[] {
    try {
        if (process.platform === 'win32') {
            const r = cp.spawnSync('powershell', [
                '-NoProfile', '-NonInteractive', '-Command',
                'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress'
            ], { encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 });
            return parseWindowsTable(r.stdout || '');
        }
        // `windowsHide` is meaningless here and set anyway — X-47's gate reads
        // every spawn in the repo, and an exception it has to reason about is
        // an exception that stops being enforced.
        const r = cp.spawnSync('ps', ['-eo', 'pid=,ppid=,comm='],
            { encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 });
        return parsePosixTable(r.stdout || '');
    } catch {
        return [];
    }
}

/** `ConvertTo-Json` emits a bare object when there is exactly one row. */
export function parseWindowsTable(stdout: string): ProcInfo[] {
    let parsed: unknown;
    try { parsed = JSON.parse(stdout.replace(/^﻿/, '').trim() || '[]'); } catch { return []; }
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const out: ProcInfo[] = [];
    for (const r of rows) {
        const o = r as Record<string, unknown>;
        const pid = Number(o?.ProcessId);
        if (!Number.isFinite(pid) || pid <= 0) { continue; }
        out.push({
            pid,
            ppid: Number.isFinite(Number(o?.ParentProcessId)) ? Number(o.ParentProcessId) : 0,
            name: typeof o?.Name === 'string' ? o.Name : ''
        });
    }
    return out;
}

export function parsePosixTable(stdout: string): ProcInfo[] {
    const out: ProcInfo[] = [];
    for (const line of String(stdout).split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
        if (!m) { continue; }
        out.push({ pid: Number(m[1]), ppid: Number(m[2]), name: (m[3] || '').trim() });
    }
    return out;
}

/**
 * What the confirmation dialog says will happen, in the user's terms.
 *
 * The chain is drawn leaf → root because that is the direction the reader
 * knows: "the session's process, and what is above it".
 */
export function describeKillTarget(t: KillTarget): string {
    const line = t.chain.map(p => `${p.name || 'process'} (${p.pid})`).join('  ←  ');
    if (t.chain.length < 2) {
        return `Nothing above pid ${t.root} belongs to this claude tree — only that process is stopped.`;
    }
    return `${line}\n\nThe whole tree above the session is stopped at its root (pid ${t.root}), `
        + 'so the daemon cannot start a replacement worker.';
}
