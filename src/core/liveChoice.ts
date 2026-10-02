import { ENGINE_MEMORY_FIELDS, EngineLaunchMemory, LastLaunch, rememberedOn } from './launch';

/**
 * ‼️ S-102 — A SETUP CHOSEN ON A LIVE CARD IS THE AGENT'S LAST SETUP.
 *
 * The record (S-34) was written only when a session STARTED, so a session
 * started at medium and raised to xhigh on its card left `medium` behind, and
 * the next new session for that agent opened on the value the person had
 * already replaced. A reopen of the SAME session reads the card's own record
 * (S-109); this is the other half, for the agent's next session.
 *
 * Only a change somebody ASKED for and the engine ACCEPTED counts: the engine
 * re-spelling a model or aligning a card at startup is not a choice. The
 * account is not here — it is not remembered at all (media/afDimensions.js).
 */
export interface SetupChoice {
    model?: string;
    effort?: string;
    permissionMode?: string;
}

/** The slice of a card's state the confirmation is read from. */
export interface ChoiceView {
    model?: string;
    effort?: string;
    permissionMode?: string;
    pendingModel?: { model: string };
    pendingEffort?: { effort: string };
    pendingPermissionMode?: { mode: string };
}

/**
 * What a live-controls engine (Claude) has just CONFIRMED: a pending switch
 * that resolved, with the value it asked for now on the card. A refusal clears
 * the pending switch and leaves the value where it was, so it yields nothing.
 * The mode is recorded as ASKED (`manual`), not as the CLI spells it back.
 */
export function confirmedChoice(before: ChoiceView, after: ChoiceView): SetupChoice | null {
    const out: SetupChoice = {};
    const pm = before.pendingModel;
    if (pm && !after.pendingModel && (after.model ?? '') === pm.model) { out.model = pm.model; }
    const pe = before.pendingEffort;
    if (pe && !after.pendingEffort && (after.effort ?? '') === pe.effort) { out.effort = pe.effort; }
    const pp = before.pendingPermissionMode;
    if (pp && !after.pendingPermissionMode
        && (after.permissionMode === pp.mode || after.permissionMode !== before.permissionMode)) {
        out.permissionMode = pp.mode;
    }
    return Object.keys(out).length ? out : null;
}

/**
 * The record with a choice written into THIS engine's row. The row starts from
 * what the record already answers for the engine (`rememberedOn`), so a choice
 * of one field never blanks the others. The flat fields follow only when they
 * describe this engine; which engine an agent opens on is a launch's answer,
 * not a card's. An agent with no record yet gets one on this engine.
 */
export function withLiveChoice(last: LastLaunch | undefined, engine: string, choice: SetupChoice): LastLaunch {
    const eng = (engine || 'claude').trim();
    const base: LastLaunch = last ?? { engine: eng as LastLaunch['engine'] };
    const seen = rememberedOn(eng, base);
    const row = Object.fromEntries(
        ENGINE_MEMORY_FIELDS.map(f => [f, String(seen[f] ?? '')])) as EngineLaunchMemory;
    const picked: EngineLaunchMemory = {};
    for (const k of ['model', 'effort', 'permissionMode'] as const) {
        if (choice[k] !== undefined) { picked[k] = choice[k]; }
    }
    const flatIsThis = (base.engine || '').trim() === eng;
    return {
        ...base,
        ...(flatIsThis ? picked : {}),
        byEngine: { ...(base.byEngine ?? {}), [eng]: { ...row, ...picked } }
    };
}
