/**
 * U-29 / U-33 — WHAT DOES "Default" MEAN FOR *THIS* AGENT ON *THIS* ENGINE?
 *
 * ‼️ THE USER'S OWN WORDING OF THE BUG, AND IT IS EXACT: "I may have set that
 * agent's default to sonnet for Claude, but if I open the same agent with Codex,
 * what does Default still mean there, and which model does it correspond to?
 * That part is a mystery."
 *
 * It was a mystery because there was only ever ONE per-agent default and it was
 * written to `<agent>/.claude/settings.local.json`. That file is Claude Code's
 * own; Codex has never read it, Antigravity has never read it, and neither has a
 * per-folder settings file of its own. So the box on the Settings page was
 * offering a choice that meant something for one engine out of four and nothing
 * at all for the other three — while looking identical for all of them.
 *
 * The fix has two halves and BOTH are needed:
 *
 *   1. **The default is per engine.** Claude's still goes in the file its CLI
 *      reads, because that is what makes it work even when a session is started
 *      from a terminal. The other three have nowhere to put it, so Agent Farm
 *      keeps them (`agentFarm.agentEngineDefaults`) and PASSES them on the
 *      command line when it starts that agent on that engine. ‼️ WHICH FLAG is
 *      asked of the engine's own builder (`engineFlagFor`) and never spelled
 *      here: this text used to say `--model` / `--effort` for all of them, and
 *      that was measured wrong on three of the four. That difference is not
 *      hidden — `originOf` says which of the two a value is.
 *   2. **"Default" says what it resolves to.** A box whose only word is
 *      "Default" is the mystery restated. `resolutionOf` produces the sentence
 *      the box prints: which value will actually be used, and who decided it.
 *
 * Pure, like engines.ts and models.ts: no vscode, no disk, no home directory.
 */

import { engineFlagFor } from './consoleEngine';
import { EngineId } from './engines';

export interface AgentEngineDefault {
    /** '' / absent = nothing chosen at this level */
    model?: string;
    effort?: string;
    /**
     * X-101 — WHICH ROUTE this agent runs the engine on: the id of a stored
     * provider profile (`agentFarm.providerProfiles`), Claude only for now.
     *
     * ‼️ A DIFFERENT KIND OF ANSWER FROM THE TWO ABOVE, and that is why it is
     * read by its own function rather than through `storedDefault`. A model and
     * an effort are command-line flags; a route is an environment isolation with
     * a credential behind it. Kept in the same record because it is the same
     * question — "how does this agent run this engine" — and a second store
     * keyed the same way would be a second thing to migrate and a second thing
     * to forget.
     */
    providerId?: string;
    /** Which tier of that route (`opus`, `sonnet`, …). The route decides what
     *  model each tier means, which is why this is not `model`. */
    tier?: string;
    /**
     * X-255 — WHICH SIGN-IN THIS AGENT STANDS ON: the id of a stored account
     * slot (`agentFarm.accounts`), for this engine.
     *
     * ‼️ OF THE SAME CLASS AS `providerId`, NOT OF `model`'s, which is why it is
     * read by `storedAccount` rather than through `storedDefault`. A model and an
     * effort are words for a command line; an account is an IDENTITY with a
     * credential directory behind it, and a single reader handing both back would
     * carry that identity into every caller that only wanted a model name.
     *
     * ‼️ AND AN EMPTY VALUE IS A REAL ANSWER HERE MORE THAN ANYWHERE ELSE:
     * `withAgentDefault` CLEARS rather than storing `''`, and an absent record is
     * exactly what makes the machine-wide standing choice apply. Storing an empty
     * string would pin this agent to "nobody" for ever — see `resolveAccount`.
     */
    account?: string;
}

/**
 * ‼️ THE RECORD'S FIELDS, IN ONE PLACE. `withAgentDefault` merges over this list
 * rather than over field names typed into it, which is what stops a field added
 * to the interface above from being silently dropped by the writer.
 */
export const AGENT_DEFAULT_FIELDS = ['model', 'effort', 'providerId', 'tier', 'account'] as const;

/** `<normalised agent dir>` → engine id → the choice. */
export type AgentEngineDefaults = Record<string, Partial<Record<EngineId, AgentEngineDefault>>>;

/** Where a value came from — a box that cannot say this is the old mystery with
 *  an extra word on it. */
export type DefaultOrigin =
    /** the agent's own `.claude/settings.local.json` — the CLI reads it itself */
    | 'agent-file'
    /** Agent Farm's per-agent, per-engine store; passed as a flag at launch */
    | 'farm'
    /** `agentFarm.launchDefaults` — the fleet-wide fallback */
    | 'launch-defaults'
    /** nothing is set anywhere; the CLI's own built-in default wins */
    | 'cli';

export interface Resolution {
    /** what will actually be sent, '' when nothing is */
    value: string;
    origin: DefaultOrigin;
    /** ONE line for the box: what "Default" means here, in words */
    note: string;
}

/**
 * Agent folders arrive from a settings file, a scan and a webview, on Windows.
 * `D:\zone\x`, `d:/zone/x` and `D:\zone\x\` are one agent, and a store keyed by
 * the raw string would hold three different answers for it.
 */
export function agentKey(dir: string): string {
    return String(dir ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** One agent's stored choice for one engine — never undefined, so a caller
 *  never has to decide what an absent record means. */
export function storedDefault(
    store: AgentEngineDefaults | undefined, dir: string, engine: EngineId
): AgentEngineDefault {
    const row = store?.[agentKey(dir)];
    const one = row?.[engine];
    return { model: (one?.model ?? '').trim(), effort: (one?.effort ?? '').trim() };
}

/**
 * ‼️ WHAT A LAUNCH BOX OPENS ON — this agent's own answer for this engine, as a
 * VALUE rather than as a sentence.
 *
 * `resolveDefault` below answers the Farm Settings page's question ("what
 * applies here, and who decided it") and carries the prose to say so. A launch
 * door asks the same question and needs only the value, one layer at a time —
 * the fleet-wide `launchDefaults` is deliberately NOT in it, because that is the
 * layer underneath and every door already applies it (`withDefaults`).
 *
 * ‼️ AND CLAUDE'S OWN FILE IS IN IT, which is the whole of this function.
 * `withAgentEngineDefaults` returns an empty model on Claude on purpose: its CLI
 * reads `<agent>/.claude/settings.local.json` itself, so passing the same value
 * again at SPAWN would be a second source of truth (X-145). But a BOX is not a
 * spawn. An agent the user had set to `opus` in Farm Settings opened every
 * composer, every launcher and every readout reading `Default` — the one word
 * that is false about it, while the effort beside it read `xhigh` because the
 * effort has no file to hide in. One question was being answered two ways in
 * one row.
 */
export function agentSeedDefault(
    engine: EngineId,
    layers: {
        /** what `<agent>/.claude/settings.local.json` says (Claude only) */
        agentFile?: string;
        /** `agentFarm.agentEngineDefaults` for this agent+engine */
        farm?: AgentEngineDefault;
    }
): { model: string; effort: string } {
    const own = layers.farm ?? {};
    const file = (layers.agentFile ?? '').trim();
    return {
        // The same order `resolveDefault` states: the file is Claude's alone,
        // and reading it for another engine is the U-29 bug itself.
        model: (engine === 'claude' ? file : '') || (own.model ?? '').trim(),
        effort: (own.effort ?? '').trim()
    };
}

/**
 * X-101 — the ROUTE one agent runs one engine on, read out of the same store.
 *
 * ‼️ SEPARATE FROM `storedDefault` DELIBERATELY. That one answers "what do I put
 * on the command line"; this one answers "which endpoint and whose key". A
 * single reader returning both would put a credential's identity into every
 * caller that only wanted a model name, and the first one to spread the record
 * onward would carry the route with it into somewhere it does not belong.
 *
 * Never undefined, so a caller never has to decide what an absent record means.
 */
export function storedRoute(
    store: AgentEngineDefaults | undefined, dir: string, engine: EngineId
): { providerId: string; tier: string } {
    const one = store?.[agentKey(dir)]?.[engine];
    return { providerId: (one?.providerId ?? '').trim(), tier: (one?.tier ?? '').trim() };
}

/**
 * X-255 — THE SIGN-IN ONE AGENT STANDS ON FOR ONE ENGINE, out of the same store.
 *
 * ‼️ ITS OWN READER, FOR `storedRoute`'S REASON AND NOT AS A STYLE. A route and
 * an account are both identities with a credential behind them; a model and an
 * effort are flags. Every caller of `storedDefault` wants a word to put on a
 * command line, and none of them should be handed an account id they did not
 * ask for and might spread onward.
 *
 * ‼️ WHAT IT DOES *NOT* DO IS DECIDE. The order this answer sits in belongs to
 * `accountStore.resolveAccount` and lives nowhere else; this only says what the
 * agent has stored. '' means the agent stands on nothing of its own, which is
 * what lets the machine-wide standing choice through.
 */
export function storedAccount(
    store: AgentEngineDefaults | undefined, dir: string, engine: EngineId
): string {
    return (store?.[agentKey(dir)]?.[engine]?.account ?? '').trim();
}

/**
 * Write one choice, returning a NEW store.
 *
 * An empty value CLEARS rather than storing '': the difference matters because
 * an empty record is what makes the next layer down apply, and a stored empty
 * string would pin the answer to "nothing" for ever.
 */
export function withAgentDefault(
    store: AgentEngineDefaults | undefined, dir: string, engine: EngineId,
    patch: AgentEngineDefault
): AgentEngineDefaults {
    const key = agentKey(dir);
    if (!key) { return { ...(store ?? {}) }; }
    const next: AgentEngineDefaults = { ...(store ?? {}) };
    const row: Partial<Record<EngineId, AgentEngineDefault>> = { ...(next[key] ?? {}) };
    const cur = row[engine] ?? {};
    /**
     * ‼️ X-103 — EVERY FIELD OF THE RECORD, NOT THE TWO THIS FUNCTION WAS BORN
     * WITH. It merged `model` and `effort` and rebuilt the record from those
     * two, so writing a model through Farm Settings DELETED the route the same
     * record held — a person who hand-wrote `providerId` into settings.json (the
     * only way to set one before this item) lost it the next time they touched
     * the model box, and nothing said so. Listing the fields once, and merging
     * over that list, is what stops the next field added here from being dropped
     * by a writer nobody remembered to update.
     */
    const merged: AgentEngineDefault = {};
    for (const f of AGENT_DEFAULT_FIELDS) {
        const v = (patch[f] !== undefined ? patch[f] : cur[f] ?? '').trim();
        // An empty value CLEARS: an absent record is what makes the next layer
        // apply, and a stored '' would pin the answer to "nothing" for ever.
        if (v) { merged[f] = v; }
    }
    if (!Object.keys(merged).length) { delete row[engine]; } else { row[engine] = merged; }
    if (!Object.keys(row).length) { delete next[key]; } else { next[key] = row; }
    return next;
}

/**
 * ‼️ THE SENTENCE THE BOX PRINTS — the whole point of the item.
 *
 * The layers, highest first: the agent's own file (Claude only, because only
 * Claude reads one), Agent Farm's per-engine store, the fleet-wide
 * `launchDefaults`, and finally the CLI's own choice. Each answer names its
 * layer, so "Default" is never again a word with no referent.
 */
export function resolveDefault(
    engine: EngineId,
    field: 'model' | 'effort',
    layers: {
        /** what `<agent>/.claude/settings.local.json` says (Claude only) */
        agentFile?: string;
        /** `agentFarm.agentEngineDefaults` for this agent+engine */
        farm?: string;
        /** `agentFarm.launchDefaults` */
        launch?: string;
        /** the engine's own name, for the sentence */
        engineLabel: string;
    }
): Resolution {
    const file = (layers.agentFile ?? '').trim();
    const farm = (layers.farm ?? '').trim();
    const launch = (layers.launch ?? '').trim();

    // ‼️ THE FILE IS CLAUDE'S ALONE. Reading it for another engine is the bug
    // itself: it is what made a `sonnet` typed for Claude look like an answer on
    // a Codex row.
    if (engine === 'claude' && file) {
        return {
            value: file, origin: 'agent-file',
            note: `${file} — this agent's own .claude/settings.local.json, which Claude Code reads `
                + 'itself, so it applies even to a session you start in a terminal.'
        };
    }
    if (farm) {
        return {
            value: farm, origin: 'farm',
            // ‼️ U-59 — THE FLAG IS ASKED OF THE ENGINE, NOT SPELLED HERE. This
            // said `--${field}` for every engine, and measured that was wrong on
            // three of the four: Codex and Gemini take the model on `-m`, and
            // OpenCode takes it on `-m` with the effort as `--variant`, which is
            // not even the same idea. An engine that carries the value some other
            // way (Codex's effort is a config assignment, not a flag) gets a
            // sentence that names none, because naming one would be a thing the
            // user could check and find false.
            note: `${farm} — set here for this agent on ${layers.engineLabel}. `
                + `Nothing is written to a per-folder file ${layers.engineLabel} reads on its own, so Agent Farm passes it `
                + `${engineFlagFor(engine, field) ? `as ${engineFlagFor(engine, field)} ` : ''}when it starts the session. `
                + 'A session you start yourself in a terminal will not have it.'
        };
    }
    if (launch) {
        return {
            value: launch, origin: 'launch-defaults',
            note: `${launch} — from agentFarm.launchDefaults, which applies to every agent and every `
                + 'engine. Set one here to override it for this agent.'
        };
    }
    return {
        value: '', origin: 'cli',
        note: `${layers.engineLabel} decides — nothing is set for this agent, and nothing fleet-wide `
            + 'either. This is the CLI\'s own built-in choice.'
    };
}

/**
 * The short form for an `<option>` label — and the ONE place it is formed, so
 * the word on the page and the word a test asserts cannot part company.
 *
 * ‼️ THE EXPLANATION IS NOT IN THE LABEL. It used to read
 * `Default (the CLI decides)`, which put a sentence inside a ~100px box whose
 * job is to hold a VALUE; the sentence belongs in the hover, where `note`
 * already carries it in full and names the engine besides. What is left is the
 * word and, when there is one, the value the row really resolves to.
 *
 * ‼️ AND IT IS PASSED THE ZERO RESOLUTION, never the box's own. "Default" means
 * "clear my choice", so the value beside it is what would apply AFTER the
 * clearing — see `resolvedZero` in panels/settingsPage.ts.
 */
export function defaultLabel(r: Resolution): string {
    return r.value ? `Default → ${r.value}` : 'Default';
}
