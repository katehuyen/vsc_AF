import * as path from 'path';
import {
    EngineAccountSlot, AccountIdentity, accountEnv, adapterFor, canIsolateAccounts, captureRefusal,
    liveSource, mintSlotId, slotDir
} from './engineAccounts';

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
    links: CaptureStep[];
    /** empty when the capture can run; the one-sentence reason otherwise */
    refusal: string;
    /**
     * ‼️ X-220 — the id of the row this plan REFRESHES rather than adds. Absent
     * means a new account; present means the list does not grow, and a caller
     * that reports "captured" either way is describing an act nobody performed.
     */
    reseats?: string;
}

/** The setting is user-editable, so nothing in it may be assumed. */
export function normalizeSlots(raw: unknown): EngineAccountSlot[] {
    if (!Array.isArray(raw)) { return []; }
    const out: EngineAccountSlot[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (!item || typeof item !== 'object') { continue; }
        const o = item as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id.trim() : '';
        const dir = typeof o.dir === 'string' ? o.dir.trim() : '';
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
            subscriptionType: typeof o.subscriptionType === 'string' ? o.subscriptionType : undefined,
            capturedAt: typeof o.capturedAt === 'number' ? o.capturedAt : undefined
        });
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
 * ‼️ AN ACCOUNT IS DELIBERATELY NOT REMEMBERED PER AGENT, unlike the model or
 * the effort. Those are preferences; an account is a STATE — how much of a plan
 * is left, which changes hourly. Remembering it per agent would pin an agent to
 * an exhausted plan and, worse, would silently outrank the "use this next"
 * gesture on the Engines page: the user would press a button that does nothing
 * visible, which is the failure Principle 1 is about. One place holds it, one
 * gesture moves it, and the runner always names its choice outright.
 */
export function resolveAccount(
    stated: string | undefined,
    engine: string | undefined,
    active: Record<string, string>
): string {
    const own = String(stated || '').trim();
    // ‼️ X-211 — the one answer that is a statement OF nothing. It outranks the
    // standing account exactly as any other stated account does; what it
    // resolves to is the absence of a slot, which is the main sign-in.
    if (own === MACHINE_ACCOUNT) { return ''; }
    if (own) { return own; }
    return active[String(engine || 'claude').trim() || 'claude'] || '';
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
    stated: string | undefined, list: EngineAccountSlot[], engine: string | undefined
): string {
    const id = String(stated || '').trim();
    // Empty = nothing stated; `@machine` = the machine's own sign-in stated
    // outright. Neither names a slot, and neither is a mistake.
    if (!id || id === MACHINE_ACCOUNT) { return ''; }
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
    /** what the user wants to call it; the address is the fallback */
    label?: string;
    now?: number;
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
function storedAs(list: EngineAccountSlot[], engine: string, email: string): EngineAccountSlot | undefined {
    const want = String(email || '').trim().toLowerCase();
    if (!want) { return undefined; }
    const eng = String(engine || '').trim();
    return (list || []).find(s =>
        s.engine === eng && String(s.email || '').trim().toLowerCase() === want);
}

export function planCapture(args: CaptureArgs): CapturePlan {
    const engine = String(args.engine || '').trim();
    const empty = (refusal: string): CapturePlan => ({ copies: [], links: [], refusal });

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
    const already = storedAs(args.stored, engine, args.identity.email);
    if (already && already.dir !== slotDir(args.root, already.id)) {
        return empty(`"${slotLabel(already)}" is already stored for this address, but its directory `
            + `is not where this machine keeps accounts — it is ${already.dir}. Re-sealing it would `
            + 'write over a folder somebody arranged by hand, and two rows for one address would be '
            + 'the same account offered twice. Nothing was captured: forget that row first if you '
            + 'want it sealed here instead.');
    }
    const id = already
        ? already.id
        : mintSlotId(engine, args.identity.email || String(args.label || ''),
            (args.stored || []).map(s => s.id));
    const dir = already ? already.dir : slotDir(args.root, id);
    const copies = a.ownFiles.map(name => ({
        from: path.join(args.home, liveSource(engine, name)),
        to: path.join(dir, name)
    }));
    // ‼️ The link points at the LIVE directory, not at another slot: every
    // session ever started, on whatever account, is still read from one root.
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
            subscriptionType: args.identity.subscriptionType || undefined,
            capturedAt: args.now ?? Date.now()
        },
        copies, links, refusal: '',
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
    return slotLabel(findSlot(list, id)) || id;
}

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
    want: { engine?: string; account?: string },
    cfg: { accounts?: unknown; activeAccounts?: unknown }
): HeadlessAccountPlan {
    const list = normalizeSlots(cfg.accounts);
    const active = normalizeActive(cfg.activeAccounts);
    const engine = String(want.engine || 'claude').trim() || 'claude';
    const stated = String(want.account || '').trim();
    // ‼️ The sentinel is resolved BEFORE the refusal, because `@machine` names
    // no slot on purpose and asking `accountRefusal` about it would be asking
    // whether "nothing" is stored.
    const id = resolveAccount(stated, engine, active);
    const refusal = accountRefusal(id, list, engine);
    if (refusal) { return { env: {}, account: '', refusal }; }
    return { env: accountEnvFor(engine, stated || id, list), account: id, refusal: '' };
}
