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
    /** the session's display name — see `nameSource` before believing it */
    name?: string;
    /**
     * Where that name came from. **'derived' means the CLI invented it**
     * (`basit-2e`, `developer-07`: folder + a short suffix) for a session
     * nobody named. Only a name the human actually chose may replace the title
     * Agent Farm derives from the conversation.
     */
    nameSource?: string;
    /** the CLI's own status word ('idle', …) — informational */
    status?: string;
    /** 'interactive' | … */
    kind?: string;
    /** 'cli' = a person's terminal · 'sdk-cli' = a program (e.g. our Console) */
    entrypoint?: string;
    startedAt?: number;
    updatedAt?: number;
}

/**
 * Is this a name a human chose, or one the CLI made up?
 *
 * Measured against the real registry: a session started without `-n` still
 * gets a `name`, marked `nameSource: "derived"`. Adopting those was a bug —
 * it replaced good titles ("fix the popup bug") with noise ("basit-2e").
 * Anything not explicitly marked as derived is treated as chosen, and a build
 * that does not report `nameSource` at all is treated as NOT chosen: falling
 * back to the conversation's own title is always the safe direction.
 */
export function isChosenName(rec: CliSessionRecord): boolean {
    if (!rec.name) { return false; }
    return typeof rec.nameSource === 'string' && rec.nameSource.toLowerCase() !== 'derived';
}

/** Where the registry lives inside a claude home. */
export function sessionsDir(claudeDir: string): string {
    return path.join(claudeDir, 'sessions');
}

/**
 * Is that process still there?
 *
 * The registry file is written by the CLI and removed when it exits cleanly —
 * but a hard kill (a closed terminal window, a crash) leaves the file behind,
 * and a stale file claims a session is open for as long as nobody notices.
 * Signal 0 asks the OS without touching the process; EPERM means it exists and
 * belongs to someone else, which still counts as alive.
 */
export function pidAlive(pid: number): boolean {
    if (!pid || pid < 1) { return false; }
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return (e as NodeJS.ErrnoException)?.code === 'EPERM';
    }
}

/** Every session the CLI currently reports as running. Never throws.
 *  Records whose process is gone are dropped: a leftover file must never keep
 *  a session un-resumable. */
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
        if (typeof o.nameSource === 'string') { rec.nameSource = o.nameSource; }
        if (typeof o.status === 'string') { rec.status = o.status; }
        if (typeof o.kind === 'string') { rec.kind = o.kind; }
        if (typeof o.entrypoint === 'string') { rec.entrypoint = o.entrypoint; }
        if (typeof o.startedAt === 'number') { rec.startedAt = o.startedAt; }
        if (typeof o.updatedAt === 'number') { rec.updatedAt = o.updatedAt; }
        // A record whose process is gone describes nothing that exists.
        if (!pidAlive(rec.pid)) { continue; }
        out.push(rec);
    }
    return out;
}

/**
 * Merge the CHOSEN names found on disk into the remembered map.
 *
 * The registry file disappears with the process, so a name is only visible
 * while the session runs — it is therefore *remembered*, never re-derived. A
 * name already known is not overwritten by a later scan unless the CLI itself
 * reports a different one (a session can be renamed mid-run).
 *
 * Names the CLI invented for itself are skipped entirely (see `isChosenName`):
 * a session nobody named keeps the title Agent Farm derives from the first
 * real thing said in it, which is what it always did and what is useful.
 *
 * `alsoAccept` lets the caller add names it KNOWS are chosen because it passed
 * them itself (`-n` from the launcher), covering CLI builds that do not report
 * `nameSource`. Returns `undefined` when nothing changed.
 */
export function mergeSessionNames(
    known: Record<string, string>,
    live: CliSessionRecord[],
    alsoAccept: string[] = []
): Record<string, string> | undefined {
    const ours = new Set(alsoAccept.map(n => n.trim()).filter(Boolean));
    let changed = false;
    const next = { ...known };
    for (const s of live) {
        if (!s.name) { continue; }
        // "derived" is the CLI telling us it made the name up — that always
        // wins over any guess of ours, even if the text happens to match a
        // name we once passed.
        if (typeof s.nameSource === 'string' && s.nameSource.toLowerCase() === 'derived') { continue; }
        if (!isChosenName(s) && !ours.has(s.name)) { continue; }
        if (next[s.sessionId] === s.name) { continue; }
        next[s.sessionId] = s.name;
        changed = true;
    }
    return changed ? next : undefined;
}

/** Sessions a live process currently owns, by claude session id. */
export function liveSessionIds(records: CliSessionRecord[]): Set<string> {
    return new Set(records.map(r => r.sessionId).filter(Boolean));
}

/**
 * Who owns this session right now? Used before resuming one: two processes on
 * the same session id both write the same transcript and never see each
 * other's turns, which looks like one conversation and is not.
 */
export function ownerOf(records: CliSessionRecord[], sessionId: string): CliSessionRecord | undefined {
    return records.find(r => r.sessionId === sessionId);
}

/** How to describe an owner to the user, honestly. */
export function describeOwner(rec: CliSessionRecord): string {
    const where = rec.entrypoint === 'sdk-cli'
        ? 'a program (an Agent Farm Console session or a headless run)'
        : 'a terminal';
    return `${where} — pid ${rec.pid}${rec.status ? `, ${rec.status}` : ''}`;
}
