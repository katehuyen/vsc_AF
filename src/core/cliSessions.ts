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
    /** 'interactive' = a conversation · 'bg' = a worker the daemon runs */
    kind?: string;
    /**
     * ‼️ S-43 — THE CLI SAYS SO ITSELF: this process is a **pre-warmed spare**.
     *
     * Claude Code v2.1+ keeps a daemon and one idle worker ready so a `claude`
     * you type starts instantly. That worker registers here exactly like a real
     * session (`"kind":"bg","spare":true,"status":"idle"`) and fires the same
     * SessionStart hook — which is how a session nobody started kept appearing
     * on the Live Timeline, and why killing it only made the daemon breed
     * another. Read from the record rather than guessed; verified against a
     * live one on disk.
     */
    spare?: boolean;
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
        if (typeof o.spare === 'boolean') { rec.spare = o.spare; }
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

/**
 * ‼️ S-43 — IS THIS THE DAEMON'S OWN WORKER RATHER THAN SOMEBODY'S SESSION?
 *
 * Two marks, and the weaker one is deliberate. `spare: true` is the CLI saying
 * it outright. `kind: 'bg'` alone is only a hint — a headless run is background
 * work too — so it is never enough on its own: the caller pairs it with "and it
 * has never received a prompt", which a real run stops satisfying the instant
 * it starts working. That pairing is what makes hiding safe: anything real
 * un-hides itself within a moment, and only a worker that never does anything
 * stays hidden.
 */
export function isSpareCliSession(rec: CliSessionRecord): boolean {
    return rec.spare === true || rec.kind === 'bg';
}

/**
 * What the registry says about one session id: `true` it is a spare/background
 * worker, `false` it is somebody's session, `undefined` **it has not said yet**.
 *
 * ‼️ The third answer is the one that matters. The SessionStart hook fires the
 * instant the worker is born, and the registry file for that pid may not be on
 * disk yet — so a caller that reads "I do not know" as "it is real" leaks the
 * very card this is built to remove, and one that reads it as "it is spare"
 * hides a session that has only just started. Neither: the question is asked
 * again later (see LiveMonitor.settleSpares), by which time the file is there.
 */
export function spareVerdict(claudeDir: string, sessionId: string): boolean | undefined {
    if (!sessionId) { return undefined; }
    const rec = ownerOf(readCliSessions(claudeDir), sessionId);
    return rec ? isSpareCliSession(rec) : undefined;
}

/** How to describe an owner to the user, honestly. */
export function describeOwner(rec: CliSessionRecord): string {
    const where = rec.entrypoint === 'sdk-cli'
        ? 'a program (an Agent Farm Console session or a headless run)'
        : 'a terminal';
    return `${where} — pid ${rec.pid}${rec.status ? `, ${rec.status}` : ''}`;
}

/**
 * ‼️ X-266 — THE REGISTRY IS PER CLAUDE HOME, AND A MACHINE HAS SEVERAL.
 *
 * `CLAUDE_CONFIG_DIR` moves the whole home, registry included: a session
 * started on an account slot writes `<slot>/sessions/<pid>.json`, and
 * `~/.claude/sessions/` stays empty. Measured 2026-09-13 with the twin on
 * disk: both records sat under the slot, and every reader that asked the
 * machine's own home answered "nobody owns this" — which is exactly the answer
 * that lets a second copy be started. So the question is asked of every home
 * at once. Directories are deduplicated by their resolved path, so a slot that
 * IS the home (a junction, a repeated setting) is read once.
 */
export function readCliSessionsAcross(dirs: (string | undefined | null)[]): CliSessionRecord[] {
    const seen = new Set<string>();
    const out: CliSessionRecord[] = [];
    for (const d of dirs) {
        if (!d || !d.trim()) { continue; }
        const key = path.resolve(d.trim()).replace(/[\\/]+$/, '').toLowerCase();
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(...readCliSessions(d.trim()));
    }
    return out;
}

/**
 * ‼️ S-59 — A PROGRAM-OWNED `claude` THAT NOBODY IS READING.
 *
 * A window reload or a crash kills the extension host and not the `claude -p`
 * under it: the child outlives its parent with its stdout on a dead pipe, still
 * holding its session in the registry, still spending. Until now such a
 * survivor showed on NO surface — the new host's seat map is empty, the task
 * board's sweep has already put its run back on the queue, and the registry is
 * read only when a resume happens to ask about that one id. This is the whole
 * set, read the same way every door reads it: what the CLI reports as
 * program-owned (`sdk-cli`), minus the daemon's spares, minus what this window
 * hosts, minus what another window is reading. What is left is running for
 * nobody.
 *
 * `ours` says whether this farm STARTED it (a Console card or a task run), and
 * that is the only kind a door may end without asking — a program-owned session
 * this farm has no record of is somebody else's SDK and is reported, not touched.
 */
export interface LeftoverClaims {
    /** a live seat of THIS window holds that id */
    hostedHere(sessionId: string): boolean;
    /** another live window's Console is reading it */
    elsewhere(sessionId: string): boolean;
    /** what of this farm's own started it, if anything is on record */
    ours(sessionId: string): 'console' | 'task' | undefined;
}
export interface Leftover {
    pid: number;
    sessionId: string;
    cwd?: string;
    name?: string;
    status?: string;
    startedAt?: number;
    ours?: 'console' | 'task';
}
export function leftoversOf(records: CliSessionRecord[], claims: LeftoverClaims): Leftover[] {
    const out: Leftover[] = [];
    for (const r of records) {
        if (r.entrypoint !== 'sdk-cli' || isSpareCliSession(r)) { continue; }
        if (claims.hostedHere(r.sessionId) || claims.elsewhere(r.sessionId)) { continue; }
        const l: Leftover = { pid: r.pid, sessionId: r.sessionId };
        if (r.cwd) { l.cwd = r.cwd; }
        if (r.name) { l.name = r.name; }
        if (r.status) { l.status = r.status; }
        if (r.startedAt) { l.startedAt = r.startedAt; }
        const ours = claims.ours(r.sessionId);
        if (ours) { l.ours = ours; }
        out.push(l);
    }
    return out.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
}

/** Session ids that MORE THAN ONE live process claims — the X-266 state itself,
 *  read straight off the registry rather than off a process list that races it. */
export function twinsOf(records: CliSessionRecord[]): { sessionId: string; pids: number[] }[] {
    const by = new Map<string, number[]>();
    for (const r of records) {
        const list = by.get(r.sessionId) ?? [];
        if (!list.includes(r.pid)) { list.push(r.pid); }
        by.set(r.sessionId, list);
    }
    return [...by.entries()].filter(([, pids]) => pids.length > 1)
        .map(([sessionId, pids]) => ({ sessionId, pids: [...pids].sort((a, b) => a - b) }));
}
