import * as path from 'path';
import {
    EngineAccountSlot, AccountIdentity, accountEnv, adapterFor, canIsolateAccounts, captureRefusal,
    liveSource, mintSlotId, slotDir
} from './engineAccounts';
import { expandPath, PortableRoot, tokenizePath } from './portablePaths';
import { AccountPolicy, isPolicyId, policyRefusal } from './accountPolicy';

/**
 * X-171 — THE SLOTS AS A LIST, AND WHAT CAPTURING ONE ACTUALLY DOES.
 *
 * `engineAccounts.ts` answers what an account IS. This answers where the set of
 * them lives, and turns "seal the sign-in that is on this disk right now" into
 * a PLAN — a list of copies and links — instead of doing it.
 *
 * ‼️ A PLAN RATHER THAN AN ACTION, for the reason every pure core in this
 * codebase exists: the interesting half of a capture is which files, from
 * where, to where, and whether it should happen at all. Executing it is four
 * lines of `fs` the host runs and nothing can go subtly wrong in. Written the
 * other way round, the only way to test the interesting half would be to
 * actually copy a real user's credentials somewhere, which is a test nobody
 * runs twice.
 *
 * ‼️ AND A CAPTURE IS A COPY, NOT A MOVE. The account being sealed is the one
 * the user is signed in as RIGHT NOW, possibly in a session that is running
 * while the button is pressed. Taking the files away would sign them out of
 * their own machine to give this extension a row in a table.
 */

/** One file or directory the capture puts somewhere. */
export interface CaptureStep {
    /** absolute source */
    from: string;
    /** absolute destination */
    to: string;
}

/**
 * What sealing the current sign-in would do — or why it would not.
 *
 * `links` are directory junctions on Windows (`mklink /J`, which needs no
 * administrator) and symlinks elsewhere. They exist because relocating a config
 * directory moves the TRANSCRIPTS too, and Agent Farm indexes one root: without
 * them a session started under a slot is invisible in the panel.
 */
export interface CapturePlan {
    /** the slot that would be created; absent when `refusal` is set */
    slot?: EngineAccountSlot;
    copies: CaptureStep[];
    /**
     * ‼️ X-265 — files copied because the SESSION needs them, not because the
     * identity does (`settings.json`). Kept apart from `copies` because an
     * empty `copies` is how a failed capture is recognised, and these must
     * never make one look successful; and because one of them being absent is
     * ordinary rather than a fault.
     */
    carries: CaptureStep[];
    links: CaptureStep[];
    /** empty when the capture can run; the one-sentence reason otherwise */
    refusal: string;
    /**
     * ‼️ X-220 — the id of the row this plan REFRESHES rather than adds. Absent
     * means a new account; present means the list does not grow, and a caller
     * that reports "captured" either way is describing an act nobody performed.
     */
    reseats?: string;
    /**
     * ‼️ X-282 — the id of a folder the list had forgotten that this plan TAKES
     * BACK, because it carries the very uuid being captured. A new row, an old
     * folder: the transcripts already in it stay where they are.
     */
    adopts?: string;
}

/**
 * The setting is user-editable, so nothing in it may be assumed.
 *
 * ‼️ X-276 — `dir` is OPENED through the machine's roots: a stored
 * `${globalStorage}\accounts\<slot>` becomes this machine's path, and an
 * absolute path another machine recorded (`c:\Users\<them>\…\globalStorage\…`)
 * heals onto this machine's storage — `expandPath` re-roots it. Without roots
 * the string is taken as written, which is what a test that owns no machine
 * wants.
 */
export function normalizeSlots(raw: unknown, roots: PortableRoot[] = []): EngineAccountSlot[] {
    if (!Array.isArray(raw)) { return []; }
    const out: EngineAccountSlot[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (!item || typeof item !== 'object') { continue; }
        const o = item as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id.trim() : '';
        const stored = typeof o.dir === 'string' ? o.dir.trim() : '';
        const dir = stored && roots.length ? expandPath(stored, roots) : stored;
        // ‼️ An entry with no id or no directory is not a slot with a gap in it,
        // it is a line somebody half-typed. Carrying it forward would put a row
        // in the picker that starts a session as nobody.
        if (!id || !dir || seen.has(id)) { continue; }
        seen.add(id);
        out.push({
            id, dir,
            engine: typeof o.engine === 'string' && o.engine.trim() ? o.engine.trim() : 'claude',
            label: typeof o.label === 'string' ? o.label : undefined,
            email: typeof o.email === 'string' ? o.email : undefined,
            accountUuid: typeof o.accountUuid === 'string' && o.accountUuid.trim() ? o.accountUuid.trim() : undefined,
            subscriptionType: typeof o.subscriptionType === 'string' ? o.subscriptionType : undefined,
            capturedAt: typeof o.capturedAt === 'number' ? o.capturedAt : undefined
        });
    }
    return out;
}

/**
 * ‼️ X-276 — THE LIST AS IT IS WRITTEN: every `dir` a token, never this
 * machine's path. `agentFarm.accounts` is the farm's own store (a capture
 * writes it), so it travels like every other store — `${globalStorage}` on the
 * way out. A dir under no known root is written as it is; there is nothing to
 * tokenize it with, and inventing a root would be worse than an honest absolute.
 */
export function portableSlots(list: EngineAccountSlot[], roots: PortableRoot[]): EngineAccountSlot[] {
    return list.map(s => ({ ...s, dir: tokenizePath(s.dir, roots) }));
}

/**
 * X-276 — the rows of the RAW setting whose `dir` names this machine rather
 * than a root: what the acceptance gate reads, and what `portableSlots` mends.
 * Read off the raw value, not the normalized list — the normalized list has
 * already been expanded and every row in it looks absolute.
 */
export function unportableDirs(raw: unknown, roots: PortableRoot[]): { id: string; dir: string; tokenizable: boolean }[] {
    if (!Array.isArray(raw)) { return []; }
    const abs = /^([A-Za-z]:[\\/]|\\\\|\/)/;
    const out: { id: string; dir: string; tokenizable: boolean }[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') { continue; }
        const o = item as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id.trim() : '';
        const dir = typeof o.dir === 'string' ? o.dir.trim() : '';
        if (!id || !dir || !abs.test(dir)) { continue; }
        out.push({ id, dir, tokenizable: tokenizePath(dir, roots) !== dir });
    }
    return out;
}

/** The active-account map (`agentFarm.activeAccounts`), engine → slot id. */
export function normalizeActive(raw: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw || typeof raw !== 'object') { return out; }
    for (const [engine, id] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof id === 'string' && id.trim()) { out[engine] = id.trim(); }
    }
    return out;
}

export function findSlot(list: EngineAccountSlot[], id: string): EngineAccountSlot | undefined {
    const want = String(id || '').trim();
    return want ? list.find(s => s.id === want) : undefined;
}

/** The slots that could start a session on this engine — never the others. */
export function slotsFor(list: EngineAccountSlot[], engine: string | undefined): EngineAccountSlot[] {
    const want = String(engine || 'claude').trim() || 'claude';
    return list.filter(s => s.engine === want);
}

/** Adding is by id: capturing the same account twice updates it, never doubles it. */
export function addSlot(list: EngineAccountSlot[], slot: EngineAccountSlot): EngineAccountSlot[] {
    const at = list.findIndex(s => s.id === slot.id);
    if (at < 0) { return [...list, slot]; }
    const out = list.slice();
    out[at] = { ...out[at], ...slot };
    return out;
}

export function forgetSlot(list: EngineAccountSlot[], id: string): EngineAccountSlot[] {
    return list.filter(s => s.id !== String(id || '').trim());
}

/**
 * ‼️ FORGETTING A SLOT MUST ALSO FORGET IT AS THE ACTIVE ONE, or the next
 * session is started with an account id pointing at nothing — and the honest
 * failure of that (fall back to the main account) looks exactly like the
 * dishonest one (silently use whichever account is signed in).
 */
export function forgetActive(active: Record<string, string>, id: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [engine, slotId] of Object.entries(active)) {
        if (slotId !== id) { out[engine] = slotId; }
    }
    return out;
}

/**
 * ‼️ WHICH ACCOUNT A LAUNCH ENDS UP ON, in one function so no surface invents
 * its own order.
 *
 * What the launch itself states wins; otherwise the engine's active account —
 * what the user last pointed at with "use this next" — and otherwise nothing at
 * all, which is the main account and today's behaviour to the character.
 *
 * ‼️ X-255 — AND THE AGENT'S OWN STANDING SIGN-IN SITS BETWEEN THEM, above the
 * machine-wide one. "developer always runs on this plan, youtuber on that one"
 * is the first thing a person wants once they hold three sign-ins, and the two
 * are DIFFERENT SUBJECTS rather than one answered twice: `activeAccounts` is the
 * machine's "use this next" and answers for every agent that names nothing,
 * while the per-agent record answers for one. Below the machine-wide choice
 * there is nothing, which is the main sign-in.
 *
 * ‼️ THE ORDER IS NOT A PREFERENCE, IT IS THE ONLY ONE THAT WORKS. A standing
 * choice is set on this machine essentially always, so a per-agent answer
 * ranked underneath it would be a control that stores what it is told and
 * changes nothing — the exact failure Principle 1 is about, arriving from the
 * other side. What that costs is that "use this next" no longer moves an agent
 * that has named its own sign-in, so BOTH surfaces say which subject they are:
 * the Engines chip names itself the machine-wide fallback, and the agent's own
 * row draws its own answer (ONE SUBJECT).
 *
 * An account is still a STATE and not a preference — how much of a plan is left
 * changes hourly — so nothing here is inherited from what an agent last RAN on
 * (S-34 does not carry it) and a run that meets a wall is still moved by
 * `carryOnAccount`. This is a typed standing instruction, not a memory.
 */
export type AccountOrigin =
    /** the launch, the door or the caller named it outright */
    | 'stated'
    /** X-255 — this agent's own standing sign-in for this engine */
    | 'agent'
    /** `agentFarm.activeAccounts` — the machine's "use this next" */
    | 'machine'
    /** nothing anywhere: the identity this machine itself is signed in as */
    | 'main';

export interface AccountResolution {
    /** the slot that will pay, '' for the machine's own sign-in */
    id: string;
    origin: AccountOrigin;
    /** ONE line for a hover: which sign-in, and who said so */
    note: string;
}

/**
 * The order above, as an answer that says WHICH LAYER GAVE IT. A surface that
 * can only print the id cannot tell a person why pressing "use this next" did
 * not move this agent — and that sentence is the whole of the trade X-255 makes.
 */
export function accountResolution(
    stated: string | undefined,
    engine: string | undefined,
    active: Record<string, string>,
    /** X-255 — `agentDefaults.storedAccount` for this agent on this engine. */
    agentStanding?: string,
    /** turns a slot id into the label a person recognises; id by default. */
    labelOf?: (id: string) => string
): AccountResolution {
    const name = (id: string): string => (labelOf ? labelOf(id) : id) || id;
    const own = String(stated || '').trim();
    const eng = String(engine || 'claude').trim() || 'claude';
    const mine = String(agentStanding || '').trim();
    const machine = active[eng] || '';
    // ‼️ X-211 — the one answer that is a statement OF nothing. It outranks every
    // standing layer exactly as any other stated account does; what it resolves
    // to is the absence of a slot, which is the main sign-in.
    if (own === MACHINE_ACCOUNT) {
        return {
            id: '', origin: 'stated',
            note: 'The identity this machine itself is signed in as — asked for outright, so '
                + 'nothing is injected and anything this window carries is cleared.'
        };
    }
    if (own) {
        return {
            id: own, origin: 'stated',
            note: `${name(own)} — named by this launch, which outranks every standing choice.`
        };
    }
    if (mine) {
        return {
            id: mine, origin: 'agent',
            note: `${name(mine)} — this agent's own standing sign-in for ${eng}. It outranks the `
                + 'machine-wide "use this next", so moving that one does not move this agent; '
                + 'clear the box on the agent\'s row to follow the machine again.'
        };
    }
    if (machine) {
        return {
            id: machine, origin: 'machine',
            note: `${name(machine)} — the machine-wide standing choice for ${eng} `
                + '("use this next" on the Engines page). This agent names none of its own.'
        };
    }
    return {
        id: '', origin: 'main',
        note: 'The identity this machine itself is signed in as — nothing is set for this agent '
            + `and nothing standing for ${eng}, so nothing is injected.`
    };
}

/** The id alone, for the callers that only spawn. One order, one place. */
export function resolveAccount(
    stated: string | undefined,
    engine: string | undefined,
    active: Record<string, string>,
    agentStanding?: string
): string {
    return accountResolution(stated, engine, active, agentStanding).id;
}

/**
 * ‼️ AN ACCOUNT ID THAT NAMES NOTHING IS REFUSED, NOT IGNORED.
 *
 * Falling back to the main account for a slot that was forgotten would start
 * the session on whichever identity happens to be signed in — the exact thing
 * this whole family exists to stop being accidental. Empty string is fine and
 * means the main account; a NAME that resolves to nothing is a mistake worth
 * stopping for.
 */
/**
 * ‼️ X-219 — WHETHER THIS SIGN-IN MAY BE RENEWED FROM ITS CARD, and how.
 *
 * A stored credential that stops refreshing can only be fixed by a person at
 * a browser. The extension's honest part is to open the ENGINE'S OWN command
 * in the SLOT'S OWN directory — and this decides where that may be offered.
 * It refuses more often than it agrees:
 *
 *   · never for the MAIN sign-in. It is the absence of a slot (X-172), the
 *     identity this machine is logged in as, and the session being talked to
 *     right now runs as it — a login there is not a card's business (X-168);
 *   · never for an engine that cannot keep two identities apart, because the
 *     login would land in the one directory both of them read;
 *   · never for a slot that is not stored, rather than guessing which was meant.
 *
 * ‼️ AND IT NEVER DECLARES THE OUTCOME. It hands back `statusArgs` — the way
 * to MEASURE the result — because the browser flow it starts can be abandoned
 * halfway, and a card that assumed success would be lying about the one fact
 * it exists to state. Every refusal comes with no command at all, so a caller
 * that ignores the sentence still cannot run anything.
 */
export interface ReauthPlan {
    refusal?: string;
    command?: string;
    args?: string[];
    /** how to read the result back, so "ready" is measured and not hoped for */
    statusArgs?: string[];
    /** the one seam every launch already goes through — no variable is spelt out here */
    env?: Record<string, string>;
    dir?: string;
}

export function planReauth(stated: string | undefined, list: EngineAccountSlot[]): ReauthPlan {
    const id = String(stated || '').trim();
    if (!id || id === MACHINE_ACCOUNT) {
        return { refusal: 'This is the main sign-in — the identity this machine is logged in '
            + 'as, which is the ABSENCE of a slot rather than one. Renewing it is done where '
            + 'you normally sign in; nothing is injected for it and no directory of its own '
            + 'would be touched.' };
    }
    const slot = findSlot(list, id);
    if (!slot) {
        return { refusal: `No account "${id}" is stored on this machine — it may have been `
            + 'forgotten. Capture it again before asking it to sign in.' };
    }
    const a = adapterFor(slot.engine);
    const how = a.signIn ? a.signIn() : undefined;
    if (!canIsolateAccounts(slot.engine) || !how) {
        return { refusal: `${slot.engine} has no verified way to keep two sign-ins apart on `
            + 'this machine, so a login started here would land in the one directory both of '
            + 'them read — and would replace the sign-in you are using rather than this row.' };
    }
    return {
        command: how.command, args: how.args, statusArgs: how.statusArgs,
        env: accountEnv(slot), dir: slot.dir
    };
}

export function accountRefusal(
    stated: string | undefined, list: EngineAccountSlot[], engine: string | undefined,
    /** X-305 — the user's named rules, so `@night` is a policy and `@nihgt` is a typo */
    policies?: AccountPolicy[]
): string {
    const id = String(stated || '').trim();
    // Empty = nothing stated; `@machine` = the machine's own sign-in stated
    // outright. Neither names a slot, and neither is a mistake.
    if (!id || id === MACHINE_ACCOUNT) { return ''; }
    // ‼️ X-305 — A POLICY IS NOT A MISSING SLOT. `@emptiest` names a RULE that
    // will choose a slot when the process is spawned; refusing it here as
    // "no account @emptiest is stored" would be the door contradicting the
    // seam. What IS refused here is a policy that does not exist.
    if (isPolicyId(id)) { return policyRefusal(id, policies); }
    const slot = findSlot(list, id);
    if (!slot) {
        return `No account "${id}" is stored on this machine — it may have been forgotten. `
            + 'Capture it again, or leave the account empty to use the main sign-in.';
    }
    const want = String(engine || 'claude').trim() || 'claude';
    if (slot.engine !== want) {
        // ‼️ An account belongs to ONE engine. Handing a Claude directory to
        // Codex sets a variable Codex does not read, so the session would start
        // on the main account while every surface claimed otherwise.
        return `Account "${id}" is a ${slot.engine} sign-in and this session is on ${want}. `
            + 'An account belongs to one engine; pick one of that engine\'s, or none.';
    }
    return '';
}

export interface CaptureArgs {
    engine: string;
    /** the user's home, from which the engine's live paths are resolved */
    home: string;
    /** where slot directories are kept (the extension's own storage) */
    root: string;
    /** who is signed in right now, read from the live directory by the caller */
    identity: AccountIdentity;
    /**
     * ‼️ X-220 — THE ACCOUNTS ALREADY ON THIS MACHINE, not a projection of them.
     *
     * This was the list of ids, which is all a fresh capture needs to count up
     * past a name it has already used. It is not enough to answer the question
     * that matters more: *is this sign-in already here?* An account is an engine
     * and an address; the id is a folder name derived from the address, so a
     * list of ids can say `claude-work` is taken and cannot say the row under it
     * is the very account being captured.
     */
    stored: EngineAccountSlot[];
    /**
     * ‼️ X-282 — EVERY SLOT FOLDER ON THE DISK, stored or not, read through the
     * engine's adapter. A folder the list has forgotten is not free ground: if
     * it carries the uuid being captured it IS this account and is taken back,
     * and if it carries another it is a name the mint must not hand out again.
     */
    onDisk?: OrphanSlot[];
    /** what the user wants to call it; the address is the fallback */
    label?: string;
    now?: number;
}

/** A slot folder found under the root — with whatever identity it will give. */
export interface OrphanSlot {
    id: string;
    dir: string;
    accountUuid?: string;
    email?: string;
}

/**
 * Seal the sign-in that is on this disk right now as a slot.
 *
 * ‼️ THE REFUSALS COME FIRST AND THEY ARE THE POINT. Sealing an engine that
 * cannot isolate, or a directory nobody is signed into, produces a row in a
 * table that starts sessions on the wrong account for ever after — and does it
 * quietly, which is the only kind of wrong this feature can be.
 */
/**
 * ‼️ X-220 — IS THIS SIGN-IN ALREADY ON THE LIST?
 *
 * An account is an ENGINE and an ADDRESS. Matching on the id instead would call
 * `claude-work` and `claude-work-2` two different accounts when they are one
 * account filed twice — which is the bug this answers. An address nobody could
 * read is NOT a match: it says the engine did not tell us who this is, not that
 * this is somebody new, and guessing there would merge two strangers.
 */
function storedAs(list: EngineAccountSlot[], engine: string, identity: { email: string; accountUuid?: string }): EngineAccountSlot | undefined {
    const eng = String(engine || '').trim();
    // ‼️ X-282 — THE UUID DECIDES WHEN BOTH SIDES HAVE ONE. An address can be
    // unreadable on a slot captured before the uuid was recorded, and the same
    // person can hold two plans on one address; the provider's own id is the
    // one key that means "the same account" and nothing else.
    const uuid = String(identity.accountUuid || '').trim();
    if (uuid) {
        const hit = (list || []).find(s => s.engine === eng && String(s.accountUuid || '').trim() === uuid);
        if (hit) { return hit; }
    }
    const want = String(identity.email || '').trim().toLowerCase();
    if (!want) { return undefined; }
    return (list || []).find(s =>
        s.engine === eng && String(s.email || '').trim().toLowerCase() === want
        // A stored uuid that DIFFERS is a different plan on the same address —
        // matching it by email would fold two accounts into one row.
        && (!uuid || !String(s.accountUuid || '').trim() || String(s.accountUuid || '').trim() === uuid));
}

export function planCapture(args: CaptureArgs): CapturePlan {
    const engine = String(args.engine || '').trim();
    const empty = (refusal: string): CapturePlan =>
        ({ copies: [], carries: [], links: [], refusal });

    const refusal = captureRefusal(engine);
    if (refusal) { return empty(refusal); }

    if (args.identity.health === 'unreadable') {
        return empty(`${engine}'s stored sign-in could not be read — it may be locked or half-written. `
            + 'Nothing was captured; try again in a moment.');
    }
    if (args.identity.health !== 'ready') {
        return empty(`Nothing is signed in to ${engine} on this machine right now. `
            + 'Sign in normally first, then capture — this seals the account that IS on the disk, '
            + 'it does not open a browser.');
    }

    const a = adapterFor(engine);
    /**
     * ‼️ X-220 — CAPTURING AN ACCOUNT THAT IS ALREADY HERE REFRESHES ITS ROW,
     * it does not open a second one.
     *
     * The id counts up past a name it has used (`claude-work-2`), which is right
     * when two plans really do share an address and wrong every other time. A
     * user who signs in again and presses Capture — the ordinary way to fix a
     * dead credential before this release — got a clone: two rows, one account,
     * one of them stale, and every picker in the product offering both.
     *
     * ‼️ AND THE SILENT PART IS BOUNDED BY THE DIRECTORY. Merging is quiet only
     * when the row lives where this machine puts it, because then the refresh
     * writes exactly the files the capture would have written anyway. A row
     * whose directory somebody arranged by hand is a DISTINCTION, and dissolving
     * a distinction the user drew — without asking — is the one move this system
     * forbids outright. So that case is refused by name, with the folder in the
     * sentence, and nothing is written.
     */
    const already = storedAs(args.stored, engine, args.identity);
    if (already && already.dir !== slotDir(args.root, already.id)) {
        return empty(`"${slotLabel(already)}" is already stored for this address, but its directory `
            + `is not where this machine keeps accounts — it is ${already.dir}. Re-sealing it would `
            + 'write over a folder somebody arranged by hand, and two rows for one address would be '
            + 'the same account offered twice. Nothing was captured: forget that row first if you '
            + 'want it sealed here instead.');
    }
    // ‼️ X-282 — A FOLDER THE LIST FORGOT IS TAKEN BACK, NOT COUNTED PAST.
    // `forget` used to drop the row and leave the folder; the next capture of
    // the same account saw the name taken and minted `-2` — a second folder,
    // a second projects/ tree, and a fleet that believed it had two quotas.
    // The uuid says it is the same account, so the same folder is re-sealed.
    const uuid = String(args.identity.accountUuid || '').trim();
    const orphan = !already && uuid
        ? (args.onDisk || []).find(o => String(o.accountUuid || '').trim() === uuid
            && o.id.startsWith(`${engine}-`) && !(args.stored || []).some(s => s.id === o.id))
        : undefined;
    const taken = [...(args.stored || []).map(s => s.id), ...(args.onDisk || []).map(o => o.id)];
    const id = already ? already.id
        : orphan ? orphan.id
            : mintSlotId(engine, args.identity.email || String(args.label || ''), taken);
    const dir = already ? already.dir : orphan ? orphan.dir : slotDir(args.root, id);
    const copies = a.ownFiles.map(name => ({
        from: path.join(args.home, liveSource(engine, name)),
        to: path.join(dir, name)
    }));
    // ‼️ The link points at the LIVE directory, not at another slot: every
    // session ever started, on whatever account, is still read from one root.
    // ‼️ X-265 — and the settings the session will run under. A COPY like the
    // identity and not a link, because it is a FILE: a junction needs no
    // administrator on Windows but a file symlink does, which is the same
    // reason `sharedPaths` holds directories only. Copied once, at capture —
    // afterwards Agent Farm keeps only its OWN hook entries in step, because
    // the rest of that file is the user's (`syncHooksToAccounts`).
    const carries = (a.carryFiles ?? []).map(name => ({
        from: path.join(args.home, liveSource(engine, name)),
        to: path.join(dir, name)
    }));
    const links = a.sharedPaths.map(name => ({
        from: path.join(args.home, a.liveDir, name),
        to: path.join(dir, name)
    }));
    return {
        slot: {
            id, engine, dir,
            // A name the user typed now wins; otherwise the row keeps the one it
            // was given. Re-sealing an account is not a reason to forget what
            // they called it.
            label: (args.label || '').trim() || already?.label || undefined,
            email: args.identity.email || undefined,
            accountUuid: uuid || already?.accountUuid || undefined,
            subscriptionType: args.identity.subscriptionType || undefined,
            capturedAt: args.now ?? Date.now()
        },
        copies, carries, links, refusal: '',
        adopts: orphan ? orphan.id : undefined,
        // ‼️ The caller is TOLD which of the two things it is about to do. A page
        // that says "captured" when a row was refreshed is describing an act
        // nobody performed, and the count above the list would not move.
        reseats: already ? already.id : undefined
    };
}

/** What to call a slot in a list — never the id, which is a folder name. */
export function slotLabel(slot: EngineAccountSlot | undefined): string {
    if (!slot) { return ''; }
    return (slot.label || '').trim() || (slot.email || '').trim() || slot.id;
}

/**
 * ‼️ X-211 — WHAT "NO SLOT" IS CALLED, EVERYWHERE, IN ONE STRING.
 *
 * The empty account id is not a gap in the answer: it is the identity this
 * machine itself is signed in as, the one every session ran on before this
 * family existed. Every surface that drew it as a blank taught the reader that
 * the control was broken — and worse, a `<select>` with no row for it shows the
 * FIRST account as selected while the session opens on the main sign-in, which
 * is the ghost selection this family exists to kill. So the absence has a name,
 * and the name is the same in the picker, the status bar and the terminal.
 */
export const MACHINE_GLOBAL = 'Machine Global';

/**
 * ‼️ X-211 — SAYING "THE MACHINE'S OWN SIGN-IN" OUT LOUD, as an answer.
 *
 * The empty account was two different answers wearing one face: **nobody chose**
 * — which falls through to the standing account, and must — and **I chose the
 * machine's own**, which must not. A picker showing Machine Global while the
 * session opened on the standing slot is precisely the ghost this family
 * exists to kill, and no default can fix it: the two answers have to be
 * different VALUES before any surface can tell them apart.
 *
 * The `@` is what makes it collision-proof. `mintSlotId` builds every id it
 * ever creates out of an engine name and `[a-z0-9-]`, so nothing this extension
 * stores can be mistaken for this one.
 *
 * ‼️ AND IT IS KEPT, NOT RESOLVED AWAY, on a session's state: a card pinned to
 * the machine's own sign-in must stay there when the "use this next" button is
 * pressed for something else an hour later. Resolving it to '' at the door
 * would put that card back on whatever the setting says at its next re-spawn.
 */
export const MACHINE_ACCOUNT = '@machine';

/** The same, as a row in a picker — the badge is what makes it read as a
 *  choice somebody made rather than a placeholder nobody filled in. */
export const MACHINE_GLOBAL_ROW = '💻 Machine Global';

/** The name of whoever pays for a run: the slot's, or the machine's own. */
export function accountLabelOf(slot: EngineAccountSlot | undefined): string {
    return slot ? slotLabel(slot) : MACHINE_GLOBAL;
}

/**
 * ‼️ X-211 — THE ENVIRONMENT LAYER FOR A **STATED** ACCOUNT, including the
 * statement that no slot is wanted.
 *
 * `accountEnv` answers for a slot and is right for everything that resolves to
 * one. The case it cannot express is the one this family added: `@machine` is
 * an answer, and the answer is that the engine's config variable must NOT be
 * set — which is not the same as not adding it, because the window Agent Farm
 * itself runs in may already carry one. Then the card would run as an account
 * no surface named, which is the ghost with the picker fixed.
 *
 * `null` is how a layer removes a name (see `spawnEnvironment`), and removal is
 * what "the identity this machine is signed in as" actually means.
 */
export function accountEnvFor(
    engine: string | undefined,
    stated: string | undefined,
    list: EngineAccountSlot[]
): Record<string, string | null> {
    const name = adapterFor(engine).configEnv;
    if (!name) { return {}; }
    const id = String(stated || '').trim();
    if (id === MACHINE_ACCOUNT) { return { [name]: null }; }
    const slot = id ? findSlot(list, id) : undefined;
    return slot?.dir ? { [name]: slot.dir } : {};
}

/**
 * What a STATED account is called on a surface — the one translation between
 * the value a session is pinned to and the words a reader sees.
 *
 * Every surface asks this rather than testing for the sentinel itself, or
 * `@machine` leaks onto a card the day somebody forgets (Principle 1). An
 * unstated account answers '' — the caller decides whether that reads as
 * "inherited" or is simply not drawn.
 */
export function statedAccountLabel(
    stated: string | undefined, list: EngineAccountSlot[]
): string {
    const id = String(stated || '').trim();
    if (!id) { return ''; }
    if (id === MACHINE_ACCOUNT) { return MACHINE_GLOBAL; }
    const slot = findSlot(list, id);
    // ‼️ X-282 — A DEAD ID SAYS SO. A task, a schedule or a session pinned to
    // an account that has since been forgotten used to show the bare id, which
    // reads like one more account; blank would read like the machine's own.
    // It is neither: the run will fall back to whoever is signed in, and the
    // surface has to say that before somebody presses it.
    return slot ? slotLabel(slot) : `${MISSING_ACCOUNT_MARK} ${id}`;
}

/** The mark a surface draws before an account id that names no stored slot. */
export const MISSING_ACCOUNT_MARK = '⚠ not on this machine:';

/**
 * ‼️ X-260 (2/n) — WHOSE PLAN PAYS FOR A TURN FIRED WHILE VS CODE IS CLOSED.
 *
 * The headless service (`src/service/farmService.ts`) spawns schedule and
 * trigger runs with NO environment at all, so whichever sign-in the machine
 * happened to hold paid for them — off the rotation, unattributable, and
 * invisible because the run itself succeeds.
 *
 * ‼️ AND THERE WAS NOTHING TO DECIDE, which is the correction this function
 * carries. The item was paused on a policy question ("who pays for a turn
 * nobody is at a window for") raised off a reading of `core/automation.ts` —
 * the trigger PRECONDITION module, which has never carried a route of any kind
 * and is not where the answer lives. `FarmSchedule extends RunDimensions` and a
 * trigger's `{ kind: 'task' }` action does too, so the account is written on the
 * item when the user makes it, persisted into `farm-tasks.json`, and already
 * honoured by the extension's own runner. One hop was missing, not a policy.
 *
 * So this is `resolveAccount` + `accountRefusal` + `accountEnvFor` in the order
 * the extension already uses them, in a shape a process with no `vscode` can
 * call. Two orders would disagree the first time one of them was changed, and
 * the night is the worst place for the disagreement to surface.
 *
 * ‼️ AND A NAME THAT RESOLVES TO NOTHING REFUSES THE RUN rather than falling
 * through to the main sign-in. That fall-through is the silent wrong spend this
 * whole family exists to end, and at 3 a.m. with nobody watching it is worse,
 * not better: the run has to be visibly skipped so somebody can see why.
 */
export interface HeadlessAccountPlan {
    /** what to add to the child's environment; `null` = REMOVE the variable. */
    env: Record<string, string | null>;
    /** the slot that will pay, or '' for the machine's own sign-in. */
    account: string;
    /** non-empty = do not start this run, and log this sentence. */
    refusal: string;
}

/**
 * The service's copy of the standing choice, as it is written into
 * `service-config.json`. Deliberately `unknown` on the way in: it is read off a
 * file another process wrote, so it is normalised here rather than trusted.
 */
export function headlessAccountPlan(
    want: { engine?: string; account?: string; agentDir?: string },
    cfg: { accounts?: unknown; activeAccounts?: unknown; agentAccounts?: unknown }
): HeadlessAccountPlan {
    const list = normalizeSlots(cfg.accounts);
    const active = normalizeActive(cfg.activeAccounts);
    const engine = String(want.engine || 'claude').trim() || 'claude';
    const stated = String(want.account || '').trim();
    /**
     * ‼️ X-255 — THE AGENT'S OWN STANDING SIGN-IN IS READ HERE TOO, and that is
     * the whole reason this edit exists rather than only the window's.
     *
     * The rule this function is built on is that the service asks the same
     * lines in the same order as the extension, so the answer cannot depend on
     * whether a window is open. A rung added to `resolveAccount` and not to the
     * table this side reads would break exactly that: "developer always runs on
     * this plan" would hold by day and silently stop holding at 3 a.m., which is
     * where it matters most and where nobody is watching.
     */
    const mine = standingAgentAccount(cfg.agentAccounts, want.agentDir, engine);
    // ‼️ The sentinel is resolved BEFORE the refusal, because `@machine` names
    // no slot on purpose and asking `accountRefusal` about it would be asking
    // whether "nothing" is stored.
    const id = resolveAccount(stated, engine, active, mine);
    const refusal = accountRefusal(id, list, engine);
    if (refusal) { return { env: {}, account: '', refusal }; }
    return { env: accountEnvFor(engine, stated || id, list), account: id, refusal: '' };
}

/**
 * X-255 — one agent's standing sign-in, out of the table the extension writes
 * into `service-config.json` (`<normalised agent dir>` → engine → slot id).
 *
 * ‼️ NORMALISED HERE BECAUSE IT COMES OFF A FILE another process wrote, like
 * everything else at this seam. The key is the agent's DIRECTORY and not its id:
 * ids are assigned by a scan and can move, and the directory is what the store
 * on the other side is keyed by (`agentDefaults.agentKey`) — two keyings of one
 * table is how the two sides come to disagree about the same agent.
 */
export function standingAgentAccount(
    table: unknown, dir: string | undefined, engine: string
): string {
    if (!table || typeof table !== 'object') { return ''; }
    const key = String(dir ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (!key) { return ''; }
    const row = (table as Record<string, unknown>)[key];
    if (!row || typeof row !== 'object') { return ''; }
    const v = (row as Record<string, unknown>)[String(engine || 'claude').trim() || 'claude'];
    return typeof v === 'string' ? v.trim() : '';
}
