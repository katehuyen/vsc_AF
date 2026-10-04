import * as path from 'path';
import { adapterFor, EngineAuthAdapter, liveSource } from './engineAccounts';
import { isJsonObject, ownedDrift, ownedTopKeys, parseOwnedFile, projectOwned } from './keyOwnership';
import {
    carriedDrift, carryMerges, heldByOtherClause, realDirOf, renderSlotSettings, reproduceSlotSettings, slotEnvGaps,
    SlotSettingsFs
} from './slotSettings';

/**
 * ‼️ X-284 — THE BIRTH CONTRACT: what a slot must carry to count as COMPLETE,
 * defined in ONE place and DERIVED FROM THE ADAPTER'S SHAPE.
 *
 * Every fault in the X-270 family was the same fault: something a session needs
 * was copied into the slot once, at capture, and nothing ever asked again.
 * Settings (X-265/X-269), hooks, the pool links (X-271) — each got its own
 * repair, its own gate and its own Doctor line, and the eleventh thing to be
 * added tomorrow would be forgotten the same way. This module is the one list.
 *
 * ‼️ "COMPLETE" MEANS "CARRIES THE LEAST POSSIBLE" (X-270 invariant). A slot is
 * the IDENTITY and nothing else; everything a session behaves by belongs to the
 * fleet and is either LINKED into the slot (a junction to the pool) or
 * REPRODUCED into it before every spawn (a single-use rendering, never a stored
 * copy). So a clause's repair never copies anything new into a slot: it links,
 * or it re-renders from the fleet's source. Deleting a slot folder and
 * capturing the account again must lose the user NOTHING — that is the
 * acceptance test of this contract, and every clause is written to pass it.
 *
 * ‼️ DERIVED, NOT LISTED. `slotClauses` walks the adapter's own fields —
 * `ownFiles`, `ownership`, `carryFiles`, `requiredEnv`, `sharedPaths` — and the test pins
 * that every field of `EngineAuthAdapter` is either one of those (and so has a
 * clause) or is declared META here. A new slot-content field without a clause
 * fails the build rather than a person's memory (the same rule as `RunDimensions`
 * in docs/CONVENTIONS.md).
 */

/** Adapter fields that describe what a slot CONTAINS — each has a clause deriver. */
export const CONTENT_KEYS = [
    'ownFiles', 'ownership', 'carryFiles', 'requiredEnv', 'sharedPaths',
    // X-277 — a shared FILE is its own clause: one file under two names, not a
    // junction and not a copy.
    'sharedFiles',
    // X-295 — `carryProject` shapes the `carry:` clause of the file it names; `liveWire` IS the `hooks` clause.
    'carryProject', 'liveWire'
] as const;
/** Adapter fields that describe the ENGINE, not the slot's contents — no clause. */
export const META_KEYS = [
    'engine', 'support', 'configEnv', 'liveDir', 'liveFiles', 'evidence', 'signIn', 'readIdentity', 'quotaSource',
    // X-292 — evidence about the engine's own housekeeping, not something a slot carries.
    'housekeeping'
] as const;

export type ClauseKind = 'own' | 'keys' | 'carry' | 'env' | 'link' | 'hooks';
/** X-270 — who the thing belongs to. `account` stays with the slot and dies with it; `fleet` is the user's and never does. */
export type ClauseOwner = 'account' | 'fleet';

export interface ClauseReading {
    ok: boolean;
    /** one line a card or a Doctor row can print */
    detail: string;
}

export interface ClauseRow extends ClauseReading {
    id: string;
    kind: ClauseKind;
    owner: ClauseOwner;
    /** false = this clause cannot be put right in place (identity: sign in again) */
    repairable: boolean;
    /** set by completeSlot: whether a repair ran and changed the disk */
    wrote?: boolean;
    /** X-292 — set by completeSlot when a repair ran: the reading it ran against */
    was?: string;
    error?: string;
}

export interface SlotContext {
    fs: SlotCompletenessFs;
    home: string;
    /** the slot folder */
    dir: string;
    slotId: string;
    engine?: string;
    adapter?: EngineAuthAdapter;
    /** the live-events port the hooks must name; omit = hooks clause is not asked */
    hooksPort?: number;
    /** X-271 — the pool-link repair lives beside the store; injected so this module stays pure */
    repairLinks?: (slotId: string, dryRun: boolean) => { linked: string[]; failed: string[] };
    /**
     * ‼️ X-291 — the merge base for one owned file: what the fleet and this slot
     * converged on at the previous gate. Injected because it lives beside the
     * store, never inside a slot. Omitted = an empty base, which promotes
     * everything the slot holds and revokes nothing — see `KeyBaseStore.get`.
     */
    keyBase?: (file: string) => Record<string, unknown>;
}

export interface SlotCompletenessFs extends SlotSettingsFs {
    lstatSync: (p: string) => { isSymbolicLink(): boolean; isDirectory(): boolean };
    realpathSync?: (p: string) => string;
    /**
     * ‼️ X-277 — A SHARED FILE IS A HARD LINK, NOT A JUNCTION, so the clause
     * needs the two calls a junction never did: `statSync` to ask whether two
     * names are one file (`ino`, measured on this machine's NTFS: two hard
     * links report the same value and a separate file a different one), and
     * `linkSync` to make one. Optional, because a stand-in that does not
     * implement them should read "cannot tell" rather than throw.
     * ‼️ `ino` is asked for as a bigint: NTFS file ids sit above 2^53 here, and
     * as a Number two different files can read the same value (measured: ids
     * …138 and …139 both read …140), which made a separate history look shared.
     */
    statSync?: (p: string, o: { bigint: true }) => { ino: number | bigint; nlink: number | bigint; size: number | bigint };
    linkSync?: (from: string, to: string) => void;
    renameSync?: (from: string, to: string) => void;
}

export interface SlotClause {
    id: string;
    kind: ClauseKind;
    owner: ClauseOwner;
    read: (ctx: SlotContext) => ClauseReading;
    /** absent = not repairable in place */
    repair?: (ctx: SlotContext, dryRun: boolean) => { wrote: boolean; error?: string };
}

const same = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** The contract for one engine, read off its adapter. */
export function slotClauses(adapter: EngineAuthAdapter): SlotClause[] {
    const out: SlotClause[] = [];
    // own — the identity. Present or the capture failed; never repaired here.
    for (const name of adapter.ownFiles) {
        out.push({
            id: `own:${name}`, kind: 'own', owner: 'account',
            read: ctx => {
                const p = path.join(ctx.dir, name);
                return ctx.fs.existsSync(p)
                    ? { ok: true, detail: `${name} present` }
                    : { ok: false, detail: `${name} missing — the identity was never captured; sign in again` };
            }
        });
    }
    // keys — the fleet's keys INSIDE a file the slot holds (X-274). Asked right
    // after the identity because the standing case is the identity file itself:
    // the sign-in is the slot's, the folder trusts and MCP servers are the
    // fleet's, and the file was copied once at capture and never asked again.
    // ‼️ X-291 — a `merge` key reads as a gap only when the slot is MISSING part
    // of the merge. A slot holding MORE than the fleet is not incomplete; it is
    // the return leg's business (`core/slotPromote`), which runs at the same
    // gates and writes the fleet's file instead of this one.
    for (const [name, own] of Object.entries(adapter.ownership ?? {})) {
        const rel = liveSource(adapter.engine, name);
        const readBoth = (ctx: SlotContext) => {
            const p = path.join(ctx.dir, name);
            const src = path.join(ctx.home, rel);
            const slotText = ctx.fs.existsSync(p) ? ctx.fs.readFileSync(p, 'utf8') : undefined;
            const fleetText = ctx.fs.existsSync(src) ? ctx.fs.readFileSync(src, 'utf8') : undefined;
            return { p, slotText, fleetText };
        };
        out.push({
            id: `keys:${name}`, kind: 'keys', owner: 'fleet',
            read: ctx => {
                const { slotText, fleetText } = readBoth(ctx);
                if (slotText === undefined) { return { ok: true, detail: `${name} absent — nothing holds the fleet's keys yet` }; }
                if (fleetText === undefined) { return { ok: true, detail: `${name} present — the fleet has no ${rel} to project from` }; }
                // ‼️ AN UNREADABLE IDENTITY FILE IS NEVER REPAIRED INTO. Projecting the
                // fleet's keys into `{}` and writing it back would erase the sign-in.
                if (!isJsonObject(slotText)) {
                    return { ok: false, detail: `${name} is not a JSON object — the fleet's keys cannot be projected into it` };
                }
                const drift = ownedDrift(own, parseOwnedFile(fleetText), parseOwnedFile(slotText), ctx.keyBase?.(name) ?? {});
                return drift.length
                    ? { ok: false, detail: `${name}: ${drift.length} fleet key${drift.length === 1 ? '' : 's'} differ — ${drift.slice(0, 4).join(', ')}${drift.length > 4 ? ', …' : ''}` }
                    : { ok: true, detail: `${name}: the fleet's keys match ${rel}` };
            },
            repair: (ctx, dryRun) => {
                const { p, slotText, fleetText } = readBoth(ctx);
                if (slotText === undefined || fleetText === undefined) { return { wrote: false }; }
                if (!isJsonObject(slotText)) { return { wrote: false, error: `${name} is not a JSON object` }; }
                const next = projectOwned(own, parseOwnedFile(fleetText), parseOwnedFile(slotText), ctx.keyBase?.(name) ?? {});
                const text = JSON.stringify(next, null, 2) + '\n';
                if (text === slotText) { return { wrote: false }; }
                if (!dryRun) { ctx.fs.writeFileSync(p, text, 'utf8'); }
                return { wrote: true };
            }
        });
    }
    // carry — the user's behaviour file, reproduced from the fleet's source (X-269).
    // ‼️ X-272 — the keys ANOTHER clause owns, so two clauses never claim one
    // fact and never overwrite each other. Derived from the same conditions that
    // create those clauses, not from a second list.
    //
    // Two of them, and they are owned in opposite directions. `hooks` is owned by
    // a clause that runs AFTER this one and re-points it at the live port, so
    // carry may render the fleet's over it and simply must not COUNT it. X-291's
    // `permissions` is owned by the `keys:` clause that runs BEFORE, so carry
    // must not count it AND must not write over it — `heldByOtherClause` keeps
    // the slot's, which is why the ignore list below is not the whole story.
    const otherClauseOwns = (name: string): string[] => {
        const out: string[] = [];
        if (adapter.liveWire?.owns?.file === name) { out.push(...adapter.liveWire.owns.keys); }
        const own = adapter.ownership?.[name];
        if (own) { out.push(...ownedTopKeys(own)); }
        return out;
    };
    for (const name of adapter.carryFiles ?? []) {
        out.push({
            id: `carry:${name}`, kind: 'carry', owner: 'fleet',
            read: ctx => {
                const p = path.join(ctx.dir, name);
                const rel = liveSource(adapter.engine, name);
                const src = path.join(ctx.home, rel);
                if (!ctx.fs.existsSync(p)) {
                    return ctx.fs.existsSync(src)
                        ? { ok: false, detail: `${name} missing — the fleet's ${rel} exists and was not reproduced` }
                        : { ok: true, detail: `${name} absent on both sides — nothing to reproduce` };
                }
                // ‼️ X-272 — AND BEING THERE IS NOT BEING CURRENT. The slot's
                // copy is a projection of the fleet's file; when the user adds,
                // changes or deletes a setting afterwards the projection is
                // stale and the only honest answer is that the slot is not
                // complete. The comparison is the reproduction's own render, so
                // there is no second opinion about what the file should say.
                const vars = adapter.requiredEnv?.file === name ? adapter.requiredEnv.vars : {};
                const sourceText = ctx.fs.existsSync(src) ? ctx.fs.readFileSync(src, 'utf8') : undefined;
                if (sourceText === undefined && !Object.keys(vars).length) {
                    return { ok: true, detail: `${name} present — the fleet has no ${rel} to reproduce from` };
                }
                const have = ctx.fs.readFileSync(p, 'utf8');
                // ‼️ X-279 — AND A FILE NOTHING IS MERGED INTO IS COMPARED AS
                // BYTES. The key-by-key comparison below exists because the
                // projection is re-serialised and indentation alone would read
                // as drift; a verbatim carry is not re-serialised, so its own
                // text is the honest question. Asking the JSON comparison about
                // `config.toml` reads `{}` on both sides and answers `ok` for
                // ever — the shape of a clause that cannot fail.
                if (!carryMerges(adapter, name)) {
                    // ‼️ X-295 — …UNLESS THE DIRECTORY MUST SIGN IT FOR ITSELF: then
                    // the projection is the honest text, and "the fleet's bytes" is
                    // the reading that hid a slot trusting none of its own hooks.
                    const project = adapter.carryProject?.[name];
                    const want = project
                        ? project(sourceText ?? have, have, { fs: ctx.fs, home: ctx.home, dir: ctx.dir, realDir: realDirOf(ctx.fs, ctx.dir) })
                        : sourceText;
                    if (want === have) { return { ok: true, detail: `${name} is the fleet's ${rel}${project ? ', signed for this directory' : ''}` }; }
                    return sourceText === have
                        ? { ok: false, detail: `${name} is the fleet's ${rel} but not signed for this directory` }
                        : { ok: false, detail: `${name} is a stale copy of the fleet's ${rel}` };
                }
                const want = renderSlotSettings(
                    sourceText === undefined ? have : sourceText, vars, heldByOtherClause(adapter, name, have));
                const drift = carriedDrift(want, have, otherClauseOwns(name));
                return drift.length
                    ? { ok: false, detail: `${name} is a stale copy — ${drift.join(', ')} no longer match the fleet's ${rel}` }
                    : { ok: true, detail: `${name} matches the fleet's ${rel}` };
            },
            repair: (ctx, dryRun) => {
                const rows = reproduceSlotSettings(ctx.fs, { home: ctx.home, dir: ctx.dir, adapter, dryRun });
                const row = rows.find(r => r.file === path.join(ctx.dir, name));
                return { wrote: !!row?.wrote, error: row?.error || undefined };
            }
        });
    }
    // env — the fleet's guarantee inside that file (X-269).
    if (adapter.requiredEnv) {
        const { file, vars } = adapter.requiredEnv;
        for (const key of Object.keys(vars)) {
            out.push({
                id: `env:${key}`, kind: 'env', owner: 'fleet',
                read: ctx => {
                    const p = path.join(ctx.dir, file);
                    const text = ctx.fs.existsSync(p) ? ctx.fs.readFileSync(p, 'utf8') : undefined;
                    const gaps = slotEnvGaps(text, { [key]: vars[key] });
                    return gaps.length
                        ? { ok: false, detail: `${file} does not carry ${key}=${vars[key]}` }
                        : { ok: true, detail: `${key}=${vars[key]} in ${file}` };
                },
                repair: (ctx, dryRun) => {
                    const rows = reproduceSlotSettings(ctx.fs, { home: ctx.home, dir: ctx.dir, adapter, dryRun });
                    const row = rows.find(r => r.file === path.join(ctx.dir, file));
                    return { wrote: !!row?.wrote, error: row?.error || undefined };
                }
            });
        }
    }
    // link — the pool, reached through a junction, never a folder of its own (X-271).
    for (const name of adapter.sharedPaths) {
        out.push({
            id: `link:${name}`, kind: 'link', owner: 'fleet',
            read: ctx => {
                const to = path.join(ctx.dir, name);
                const from = path.join(ctx.home, adapter.liveDir, name);
                let st: { isSymbolicLink(): boolean; isDirectory(): boolean } | undefined;
                try { st = ctx.fs.lstatSync(to); } catch { st = undefined; }
                if (!st) { return { ok: false, detail: `${name} missing — no link to the pool` }; }
                if (!st.isSymbolicLink()) {
                    return { ok: false, detail: `${name} is a real ${st.isDirectory() ? 'folder' : 'file'} inside the slot — a record living under an account` };
                }
                // ‼️ BOTH SIDES ARE RESOLVED, OR EVERY HEALTHY SLOT READS AS A GAP.
                // Measured 2026-09-13 against this machine: `~/.claude` is ITSELF a
                // junction into the agent repo, so the slot's link resolved to the
                // D: path while the expected side was still the unresolved C: one and
                // all twelve link clauses read false on a fleet with nothing wrong
                // with it. A badge that is permanently wrong is the Principle 1
                // failure this whole item exists to end, so the comparison asks the
                // file system for both. The pool may legitimately not exist yet
                // (a fresh machine), and then the unresolved path is what to compare
                // against - which is also what the repair refuses to invent.
                if (ctx.fs.realpathSync) {
                    try {
                        const real = ctx.fs.realpathSync(to);
                        let want = from;
                        try { want = ctx.fs.realpathSync(from); } catch { /* no pool yet */ }
                        if (!same(real, want)) { return { ok: false, detail: `${name} links to ${real}, not the pool` }; }
                    } catch { return { ok: false, detail: `${name} link is broken` }; }
                }
                return { ok: true, detail: `${name} → pool` };
            },
            repair: (ctx, dryRun) => {
                if (!ctx.repairLinks) { return { wrote: false, error: 'no link repair wired' }; }
                const r = ctx.repairLinks(ctx.slotId, dryRun);
                const to = path.join(ctx.dir, name);
                const failed = r.failed.some(f => same(f, to));
                return { wrote: r.linked.some(f => same(f, to)), error: failed ? 'link repair failed' : undefined };
            }
        });
    }
    /**
     * ‼️ X-277 — SHARED FILES: ONE FILE UNDER TWO NAMES, not a copy in each slot.
     *
     * A folder is reached by a junction; a file the engine APPENDS to cannot
     * be, because two copies diverge the moment either is written. So this is a
     * hard link, and everything below follows from that being a different
     * mechanism rather than the same one on a smaller object:
     *
     *  · sameness is `ino`, not a path comparison — a hard link has no target
     *    to resolve and `lstat` reports it as an ordinary file, which is
     *    exactly why the `link:` clause above cannot answer this question;
     *  · a slot that has its own file is DRAINED into the pool and then linked,
     *    the same order X-271 uses for a folder — never overwritten, because
     *    what is in there is the user's own typing;
     *  · a hard link cannot cross volumes, so a slot on another drive is told
     *    so BY NAME rather than quietly given a copy. "Copy it into the slot"
     *    is the answer this family exists to refuse.
     */
    for (const name of adapter.sharedFiles ?? []) {
        const poolOf = (ctx: SlotContext) => path.join(ctx.home, adapter.liveDir, name);
        const mineOf = (ctx: SlotContext) => path.join(ctx.dir, name);
        const inoOf = (ctx: SlotContext, p: string): string | undefined => {
            if (!ctx.fs.statSync) { return undefined; }
            try { return String(ctx.fs.statSync(p, { bigint: true }).ino); } catch { return undefined; }
        };
        out.push({
            id: `link:${name}`, kind: 'link', owner: 'fleet',
            read: ctx => {
                const pool = poolOf(ctx), mine = mineOf(ctx);
                const hasPool = ctx.fs.existsSync(pool), hasMine = ctx.fs.existsSync(mine);
                // ‼️ NOTHING TO SHARE IS NOT A GAP. On a fresh machine neither
                // side exists, and the engine makes the file the first time
                // somebody types into it — inventing one here would put an empty
                // file in front of that and answer a question nobody asked.
                if (!hasPool && !hasMine) { return { ok: true, detail: `no ${name} on this machine yet` }; }
                if (!hasMine) { return { ok: false, detail: `${name} missing — the slot has no link to the pool's` }; }
                if (!hasPool) { return { ok: false, detail: `${name} lives only inside the slot — the pool has none` }; }
                const a = inoOf(ctx, pool), b = inoOf(ctx, mine);
                if (a === undefined || b === undefined) {
                    // ‼️ CANNOT TELL IS NOT WRONG. A file system that does not
                    // report an inode would make every healthy slot read as a
                    // gap, which is the permanently-wrong badge this family
                    // keeps having to undo.
                    return { ok: true, detail: `${name} present (this file system cannot say whether it is shared)` };
                }
                return a === b
                    ? { ok: true, detail: `${name} → pool (one file, two names)` }
                    : { ok: false, detail: `${name} is a history of its own inside the slot` };
            },
            repair: (ctx, dryRun) => {
                const pool = poolOf(ctx), mine = mineOf(ctx);
                const hasPool = ctx.fs.existsSync(pool), hasMine = ctx.fs.existsSync(mine);
                if (!hasPool && !hasMine) { return { wrote: false }; }
                if (!ctx.fs.linkSync || !ctx.fs.statSync) {
                    return { wrote: false, error: 'no hard-link support wired' };
                }
                if (hasMine && hasPool && inoOf(ctx, pool) === inoOf(ctx, mine)) { return { wrote: false }; }
                if (dryRun) { return { wrote: false }; }
                try {
                    // The slot's own file goes to the pool FIRST where there is
                    // nothing there yet — it is the user's typing and this is the
                    // one moment it could be lost.
                    if (hasMine && !hasPool) {
                        if (!ctx.fs.renameSync) { return { wrote: false, error: 'no rename wired to drain the slot' }; }
                        ctx.fs.renameSync(mine, pool);
                    } else if (hasMine) {
                        // Both exist and are different files. The pool is the
                        // fleet's and stays; the slot's copy is moved aside under
                        // a name that says what it is, never deleted.
                        if (!ctx.fs.renameSync) { return { wrote: false, error: 'no rename wired to set the slot copy aside' }; }
                        ctx.fs.renameSync(mine, `${mine}.slot-copy`);
                    }
                    ctx.fs.linkSync(pool, mine);
                    return { wrote: true };
                } catch (e) {
                    const msg = String((e as { code?: string; message?: string })?.code
                        ?? (e as { message?: string })?.message ?? e);
                    // ‼️ EXDEV IS THE ONE FAILURE WORTH ITS OWN SENTENCE: a hard
                    // link cannot cross volumes, and the honest answer is to say
                    // the slot is on another drive — not to leave a copy behind
                    // and call the slot complete.
                    return {
                        wrote: false,
                        error: /EXDEV/i.test(msg)
                            ? `${name} cannot be shared: the slot is on a different drive from the pool, and a hard link cannot cross one`
                            : msg
                    };
                }
            }
        });
    }
    // hooks — the live wire, in the engine's own terms (X-295), asked only when the caller knows the port.
    const wire = adapter.liveWire;
    if (wire) {
        const wctx = (ctx: SlotContext, port: number) =>
            ({ fs: ctx.fs, home: ctx.home, dir: ctx.dir, realDir: realDirOf(ctx.fs, ctx.dir), hooksPort: port });
        out.push({
            id: 'hooks', kind: 'hooks', owner: 'fleet',
            read: ctx => ctx.hooksPort === undefined
                ? { ok: true, detail: 'hooks not asked (no port)' }
                : wire.read(wctx(ctx, ctx.hooksPort)),
            repair: (ctx, dryRun) => ctx.hooksPort === undefined
                ? { wrote: false }
                : wire.repair(wctx(ctx, ctx.hooksPort), dryRun)
        });
    }
    return out;
}

export interface SlotCompleteness {
    slotId: string;
    engine: string;
    complete: boolean;
    /** clause ids that read false */
    gaps: string[];
    rows: ClauseRow[];
}

/** Read-only: is this slot complete, and if not, exactly what is missing. */
export function slotCompleteness(ctx: SlotContext): SlotCompleteness {
    const adapter = ctx.adapter ?? adapterFor(ctx.engine);
    const rows: ClauseRow[] = slotClauses(adapter).map(c => {
        let r: ClauseReading;
        try { r = c.read(ctx); } catch (e) { r = { ok: false, detail: String((e as Error)?.message ?? e) }; }
        return { id: c.id, kind: c.kind, owner: c.owner, repairable: !!c.repair, ...r };
    });
    return {
        slotId: ctx.slotId, engine: adapter.engine,
        complete: rows.every(r => r.ok), gaps: rows.filter(r => !r.ok).map(r => r.id), rows
    };
}

/**
 * Put every failing, repairable clause right, then read again. Idempotent: a
 * complete slot costs its reads and writes nothing. `dryRun` reports what would
 * be written and touches nothing.
 */
export function completeSlot(ctx: SlotContext, dryRun = false): SlotCompleteness {
    const adapter = ctx.adapter ?? adapterFor(ctx.engine);
    const clauses = slotClauses(adapter);
    const before = slotCompleteness({ ...ctx, adapter });
    const wrote = new Map<string, { wrote: boolean; error?: string }>();
    for (const c of clauses) {
        const row = before.rows.find(r => r.id === c.id);
        if (!row || row.ok || !c.repair) { continue; }
        try { wrote.set(c.id, c.repair(ctx, dryRun)); }
        catch (e) { wrote.set(c.id, { wrote: false, error: String((e as Error)?.message ?? e) }); }
    }
    const after = dryRun ? before : slotCompleteness({ ...ctx, adapter });
    for (const r of after.rows) {
        const w = wrote.get(r.id);
        if (!w) { continue; }
        r.wrote = w.wrote;
        // ‼️ X-292 — the row that was repaired carries the reading it was
        // repaired FROM. After the repair the detail says everything is well,
        // which is exactly the sentence that hid a recurring fault for a week.
        r.was = before.rows.find(b => b.id === r.id)?.detail;
        if (w.error) { r.error = w.error; }
    }
    return after;
}
