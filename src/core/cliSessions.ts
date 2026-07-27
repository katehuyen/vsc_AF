/**
 * The CLI's own live session registry — `~/.claude/sessions/<pid>.json`.
 *
 * Claude Code writes one small JSON per running session and deletes it when
 * the process exits. It carries the things a transcript never gets:
 *
 *   { pid, sessionId, cwd, startedAt, version, kind, entrypoint,
 *     name, status, updatedAt, statusUpdatedAt }
 *
 * `name` is the one that matters here: the display name a session is started
 * with (`claude -n "…"`, which the Start Session… launcher passes). It lives
 * only in this file — it is NOT written into the transcript — so a session
 * named at launch would show its auto-derived title everywhere in Agent Farm
 * and the name would vanish with the process. Reading it here and persisting
 * it is what makes the launcher's "Session name" field mean something.
 *
 * Read-only, always: this is the CLI's runtime state, not ours. Anything
 * unreadable or unexpected is skipped rather than guessed at.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CliSessionRecord {
    pid: number;
    sessionId: string;
    cwd?: string;
    /** display name set with -n (absent when the session was started without one) */
    name?: string;
    /** the CLI's own status word ('idle', …) — informational */
    status?: string;
    /** 'interactive' | … */
    kind?: string;
    entrypoint?: string;
    startedAt?: number;
    updatedAt?: number;
}

/** Where the registry lives inside a claude home. */
export function sessionsDir(claudeDir: string): string {
    return path.join(claudeDir, 'sessions');
}

/** Every session the CLI currently reports as running. Never throws. */
export function readCliSessions(claudeDir: string): CliSessionRecord[] {
    const dir = sessionsDir(claudeDir);
    let files: string[] = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { return []; }
    const out: CliSessionRecord[] = [];
    for (const f of files) {
        let raw: string;
        try { raw = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
        let o: Record<string, unknown>;
        try { o = JSON.parse(raw.replace(/^﻿/, '')) as Record<string, unknown>; } catch { continue; }
        const sessionId = typeof o.sessionId === 'string' ? o.sessionId : '';
        if (!sessionId) { continue; }
        const rec: CliSessionRecord = {
            pid: typeof o.pid === 'number' ? o.pid : 0,
            sessionId
        };
        if (typeof o.cwd === 'string') { rec.cwd = o.cwd; }
        if (typeof o.name === 'string' && o.name.trim()) { rec.name = o.name.trim(); }
        if (typeof o.status === 'string') { rec.status = o.status; }
        if (typeof o.kind === 'string') { rec.kind = o.kind; }
        if (typeof o.entrypoint === 'string') { rec.entrypoint = o.entrypoint; }
        if (typeof o.startedAt === 'number') { rec.startedAt = o.startedAt; }
        if (typeof o.updatedAt === 'number') { rec.updatedAt = o.updatedAt; }
        out.push(rec);
    }
    return out;
}

/**
 * Merge the names found on disk into the remembered map.
 *
 * The registry file disappears with the process, so a name is only visible
 * while the session runs — it is therefore *remembered*, never re-derived. A
 * name already known is not overwritten by a later scan unless the CLI itself
 * reports a different one (a session can be renamed with /name mid-run).
 * Returns `undefined` when nothing changed, so callers can skip the update and
 * the re-render it would cause.
 */
export function mergeSessionNames(
    known: Record<string, string>,
    live: CliSessionRecord[]
): Record<string, string> | undefined {
    let changed = false;
    const next = { ...known };
    for (const s of live) {
        if (!s.name) { continue; }
        if (next[s.sessionId] === s.name) { continue; }
        next[s.sessionId] = s.name;
        changed = true;
    }
    return changed ? next : undefined;
}
