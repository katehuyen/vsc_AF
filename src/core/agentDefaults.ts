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
}

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
    const merged: AgentEngineDefault = {
        model: (patch.model !== undefined ? patch.model : cur.model ?? '').trim(),
        effort: (patch.effort !== undefined ? patch.effort : cur.effort ?? '').trim()
    };
    if (!merged.model) { delete merged.model; }
    if (!merged.effort) { delete merged.effort; }
    if (!merged.model && !merged.effort) { delete row[engine]; } else { row[engine] = merged; }
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

/** The short form for a `<option>` label: `Default (sonnet)` rather than the
 *  bare word that started all this. */
export function defaultLabel(r: Resolution): string {
    return r.value ? `Default → ${r.value}` : 'Default (the CLI decides)';
}
