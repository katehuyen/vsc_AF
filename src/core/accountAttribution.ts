/**
 * X-333 — WHICH SIGN-IN REALLY RAN THIS, when the launch record cannot say.
 *
 * ‼️ THE COMPLAINT THAT OPENED IT, in the user's own words: a card reading
 * `last used 3d ago` — or `today — nothing ran here` — for an account they had
 * used an hour ago and three times that day. Not a rendering fault. X-251 made
 * the LaunchManifest the one reader (`sessionAccountOf`), deliberately with no
 * fallback, because the alternative on the table then was guessing the
 * machine's current sign-in onto an unplaced run and putting one account's
 * dollars on another's card. That refusal is still right. What was wrong is
 * treating it as the ONLY evidence there is: a terminal the user opened
 * themselves, a session resumed under a different sign-in, anything from
 * before X-251 — all seal no manifest, and the card then says the account was
 * idle, which is not "I do not know", it is a wrong answer stated plainly.
 *
 * The engines keep records of their own, and those are not guesses:
 *
 *   1. **The manifest.** What this farm sealed at launch. Certain, and first.
 *   2. **The CLI's own session registry** — `<slot>/sessions/<pid>.json`, which
 *      is NOT one of the shared junctions, so a record under a slot is a
 *      process that ran with that slot as its config dir. Certain. It holds
 *      live processes only, so it answers for now, not for last week.
 *   3. **The slot's own `.claude.json`** — `projects[<cwd>].lastSessionId`, the
 *      CLI writing down what it last did where. ‼️ AND THIS ONE IS BOOBY
 *      TRAPPED: `.claude.json` is an `ownFiles` entry, so CAPTURING a slot
 *      COPIES it, and the copy carries the other account's history. Measured on
 *      this machine, 2026-09-20: five session ids appeared identically under
 *      all four Claude slots. A value that is not UNIQUE across slots is a copy
 *      and proves nothing — it is dropped, not shared out.
 *   4. **The slot being touched at all.** When nothing names a session, the
 *      slot's own files still changed at a time, and "something ran here at
 *      14:02" is a true answer where "nothing ran here" was a false one. It
 *      names no session and is never counted as spend. A touch at or before the
 *      slot's capture is the CAPTURE, not a run.
 *
 * ‼️ NOTHING HERE GUESSES. Every layer is a record somebody else wrote down;
 * where no record exists the answer stays absent, and the unattributed row
 * keeps its meaning. The layer that answered travels with the answer (`why`),
 * because a figure sourced from a touch is not the same claim as one sourced
 * from a manifest and a card must be able to say which it is holding.
 *
 * Pure: no io, no vscode, no clock of its own.
 */

/** Which record answered. Ordered by how little it leaves to interpretation. */
export type AttributionWhy = 'manifest' | 'registry' | 'slot-record' | 'slot-touch';

/** One slot's claim on one session, and the record behind it. */
export interface Attribution {
    slot: string;
    why: AttributionWhy;
}

/** `<slot>/sessions/<pid>.json` — one live process, one config dir. */
export interface RegistryRecord {
    slot: string;
    sessionId: string;
}

/** `<slot>/.claude.json` → `projects[cwd].lastSessionId` and its start time. */
export interface SlotRecord {
    slot: string;
    sessionId: string;
    /** `lastStartTime`, epoch ms; 0 when the CLI wrote none. */
    at?: number;
}

/** The slot's own files changed — a time with no session attached to it. */
export interface SlotTouch {
    slot: string;
    at: number;
    /**
     * When the slot was captured. A touch at or before it is the capture
     * copying files in, and reporting that as a run would make every slot look
     * used the day it was made.
     */
    capturedAt?: number;
}

export interface AccountEvidence {
    /** sessionId → slot, as the launch record sealed it. */
    manifest?: Record<string, string>;
    registry?: readonly RegistryRecord[];
    slotRecords?: readonly SlotRecord[];
    touches?: readonly SlotTouch[];
}

/**
 * ‼️ THE COPY GUARD. A slot record whose session id appears under more than one
 * slot came from the capture, not from a run — `.claude.json` travels with the
 * sign-in it was copied from. Dropping it is the whole difference between this
 * layer and an invention: one session cannot have run on four accounts, and
 * handing it to the first slot alphabetically would be exactly the arbitrary
 * attribution X-251 refused.
 */
export function uniqueSlotRecords(records: readonly SlotRecord[]): SlotRecord[] {
    const slotsPerSession = new Map<string, Set<string>>();
    for (const r of records) {
        if (!r.sessionId || !r.slot) { continue; }
        const set = slotsPerSession.get(r.sessionId) ?? new Set<string>();
        set.add(r.slot);
        slotsPerSession.set(r.sessionId, set);
    }
    const out: SlotRecord[] = [];
    const taken = new Set<string>();
    for (const r of records) {
        if (!r.sessionId || !r.slot) { continue; }
        if ((slotsPerSession.get(r.sessionId)?.size ?? 0) !== 1) { continue; }
        // One slot may name the same session under two cwds; it is one claim.
        if (taken.has(r.sessionId)) { continue; }
        taken.add(r.sessionId);
        out.push(r);
    }
    return out;
}

/**
 * Every session any record can place, and which record placed it.
 *
 * The layers are tried in order and the first one that answers wins — a
 * manifest is a decision this farm made and outranks an inference from a file,
 * however good the file is.
 */
export function attributeSessions(ev: AccountEvidence): Map<string, Attribution> {
    const out = new Map<string, Attribution>();
    for (const [sessionId, slot] of Object.entries(ev.manifest ?? {})) {
        const id = String(slot ?? '').trim();
        if (sessionId && id) { out.set(sessionId, { slot: id, why: 'manifest' }); }
    }
    for (const r of ev.registry ?? []) {
        if (!r.sessionId || !r.slot || out.has(r.sessionId)) { continue; }
        out.set(r.sessionId, { slot: r.slot, why: 'registry' });
    }
    for (const r of uniqueSlotRecords(ev.slotRecords ?? [])) {
        if (out.has(r.sessionId)) { continue; }
        out.set(r.sessionId, { slot: r.slot, why: 'slot-record' });
    }
    return out;
}

/** What a card can say about when a sign-in was last on. */
export interface SlotActivity {
    slot: string;
    /** epoch ms */
    at: number;
    why: AttributionWhy;
    /** the run behind it — absent when only a touch answered */
    sessionId?: string;
}

/**
 * ‼️ THE ANSWER THE CARD ACTUALLY ASKS FOR, and the one that was wrong.
 *
 * `lastUseByAccount` could only see sessions the manifest placed, so a sign-in
 * used from a terminal read as idle. Here every layer gets to speak, and where
 * none of them can name a run, a TOUCH still gives a time — `something ran
 * here at 14:02` rather than `nothing ran here`. The two are different claims
 * and `why` keeps them apart: a caller drawing a session title beside the time
 * must not do it on a row that never had one.
 *
 * `lastTsOf` says when a session was last active; a session the index does not
 * know is skipped rather than dated from the record that named it, because a
 * `lastStartTime` is when a run BEGAN and using it as "last used" would date a
 * four-hour conversation to its first minute.
 */
export function slotActivity(
    ev: AccountEvidence,
    lastTsOf: (sessionId: string) => number | undefined
): Map<string, SlotActivity> {
    const out = new Map<string, SlotActivity>();
    const offer = (a: SlotActivity) => {
        if (!a.slot || !(a.at > 0)) { return; }
        const had = out.get(a.slot);
        if (!had || a.at > had.at) { out.set(a.slot, a); }
    };
    for (const [sessionId, at] of attributeSessions(ev)) {
        const ts = lastTsOf(sessionId);
        if (ts) { offer({ slot: at.slot, at: ts, why: at.why, sessionId }); }
    }
    // ‼️ A SLOT RECORD'S OWN START TIME IS A FLOOR, not a replacement. It is
    // used only for a session the index cannot date at all — a transcript that
    // was never scanned still proves the slot was on.
    for (const r of uniqueSlotRecords(ev.slotRecords ?? [])) {
        if (r.at && r.at > 0 && lastTsOf(r.sessionId) === undefined) {
            offer({ slot: r.slot, at: r.at, why: 'slot-record', sessionId: r.sessionId });
        }
    }
    for (const t of ev.touches ?? []) {
        if (t.capturedAt && t.at <= t.capturedAt) { continue; }
        offer({ slot: t.slot, at: t.at, why: 'slot-touch' });
    }
    return out;
}

/**
 * How firmly a figure derived from this layer may be stated. A card that draws
 * a dollar total off a touch would be inventing one, so spend counts only the
 * layers that name a run — and the word is here rather than in an `if` on the
 * page, so a fifth layer cannot arrive with no policy.
 */
export const COUNTS_AS_SPEND: Record<AttributionWhy, boolean> = {
    manifest: true,
    registry: true,
    'slot-record': true,
    // names no session: there is nothing to add up
    'slot-touch': false
};

/** One line a hover can carry, saying where the claim came from. */
export const WHY_SAID: Record<AttributionWhy, string> = {
    manifest: 'Agent Farm started this run on this sign-in and wrote it down.',
    registry: 'the CLI\'s own session registry under this sign-in\'s config directory',
    'slot-record': 'this sign-in\'s own .claude.json says it last ran that session',
    'slot-touch': 'this sign-in\'s files changed then — the run itself was not recorded'
};
