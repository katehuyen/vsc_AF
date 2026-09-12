import * as path from 'path';
import { adapterFor, EngineAuthAdapter, liveSource } from './engineAccounts';

/**
 * Slot behaviour files — reproduced, never stored (X-269).
 *
 * ‼️ THE SLOT'S `settings.json` IS NOT THE SLOT'S. `carryFiles` copied the main
 * settings file into a slot ONCE, at capture, and never looked again: a key the
 * user added afterwards reached no slot that already existed. Measured
 * 2026-09-12 — not one of the five `claude-*` slots on this machine carried
 * `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`, so every Claude session Agent Farm had
 * ever started under an account ran on Anthropic's SIMPLIFIED system prompt
 * while the user's standing decision is the full one, and no surface said so
 * (Principle 1).
 *
 * ‼️ AND THE FIX IS NOT "COPY AT CAPTURE TOO" — that repeats the same mistake
 * on the next key. The file is REPRODUCED from the fleet's own source before
 * every gate that can lead to a session, which makes the slot copy a
 * single-use output: there is nothing left to go stale, and deleting the
 * account takes no setting with it. An account is a quota, not a place to keep
 * things (X-270).
 *
 * ‼️ THE ENGINE DECIDES WHAT IT NEEDS. The contract lives on the adapter
 * (`requiredEnv`), so nothing here spells out one engine's variable and then
 * writes a `settings.json` into a Codex slot that has never heard of one.
 */

export interface SlotSettingsFs {
    existsSync(p: string): boolean;
    readFileSync(p: string, enc: 'utf8'): string;
    writeFileSync(p: string, data: string, enc: 'utf8'): void;
    mkdirSync(p: string, o: { recursive: boolean }): void;
}

/** What one gate did to one slot — reported, because a silent repair is not one. */
export interface SlotSettingsResult {
    /** the slot directory this is about */
    dir: string;
    /** the file inside it that was reproduced */
    file: string;
    /** true when the file on disk did not already say this — with `dryRun`, what WOULD be written */
    wrote: boolean;
    /** contract names the file was NOT carrying before this ran */
    gaps: string[];
    /** why nothing could be written; '' when all is well */
    error: string;
}

const parse = (text: string | undefined): Record<string, unknown> => {
    if (!text || !text.trim()) { return {}; }
    try {
        const v = JSON.parse(text) as unknown;
        return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
    } catch { return {}; }
};

/**
 * The contract names this file does not carry — missing, or holding something
 * else. What the badge, the doctor and the gate all count, so they cannot
 * disagree about whether a slot is right.
 */
export function slotEnvGaps(text: string | undefined, vars: Record<string, string>): string[] {
    const env = parse(text).env;
    const held = env && typeof env === 'object' && !Array.isArray(env)
        ? env as Record<string, unknown> : {};
    return Object.entries(vars)
        .filter(([k, v]) => String(held[k] ?? '') !== String(v))
        .map(([k]) => k);
}

/**
 * What the slot file should say: the fleet's own file, with the contract
 * applied over its `env` block.
 *
 * ‼️ THE SOURCE IS THE BASE AND THE CONTRACT IS THE OVERLAY, in that order.
 * The user's model, permission mode and live hooks travel because they are in
 * the base; the contract wins where they collide, because a slot that disagrees
 * with the fleet about the system prompt is the fault this exists to end.
 */
export function renderSlotSettings(
    sourceText: string | undefined, vars: Record<string, string>
): string {
    const out = parse(sourceText);
    if (Object.keys(vars).length) {
        const env = out.env;
        const base = env && typeof env === 'object' && !Array.isArray(env)
            ? { ...env as Record<string, unknown> } : {};
        out.env = { ...base, ...vars };
    }
    return JSON.stringify(out, null, 2) + '\n';
}

/**
 * Reproduce ONE slot's behaviour files from the live directory.
 *
 * Idempotent by comparison, not by flag: the rendered text is compared with
 * what is on disk and a file that already says it is left alone, so this may be
 * called on capture, on re-capture and before every spawn without costing more
 * than a read.
 */
export function reproduceSlotSettings(
    fs: SlotSettingsFs,
    opts: { home: string; dir: string; engine?: string; adapter?: EngineAuthAdapter; dryRun?: boolean }
): SlotSettingsResult[] {
    const a = opts.adapter ?? adapterFor(opts.engine);
    const out: SlotSettingsResult[] = [];
    for (const name of a.carryFiles ?? []) {
        const target = path.join(opts.dir, name);
        const vars = a.requiredEnv?.file === name ? a.requiredEnv.vars : {};
        const row: SlotSettingsResult = { dir: opts.dir, file: target, wrote: false, gaps: [], error: '' };
        try {
            const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
            row.gaps = slotEnvGaps(before, vars);
            const from = path.join(opts.home, liveSource(a.engine, name));
            const sourceText = fs.existsSync(from) ? fs.readFileSync(from, 'utf8') : undefined;
            // ‼️ NOTHING TO COPY IS NOT NOTHING TO DO. A machine with no main
            // settings file still gets the contract — the guarantee is the
            // fleet's, not the file's — but a slot with no contract and no
            // source has nothing to reproduce and is left as it is rather than
            // given an empty `{}` to read.
            if (sourceText === undefined && !Object.keys(vars).length) { out.push(row); continue; }
            // ‼️ AND AN ABSENT SOURCE NEVER ERASES WHAT IS THERE. Reproduction
            // renders the fleet's file over the slot's, so a machine whose main
            // `settings.json` has been moved or deleted would render a
            // contract-only stub over a slot holding the user's model,
            // permissions and hooks. With no source the slot's OWN text is the
            // base: the guarantee is still enforced, and nothing of theirs is
            // thrown away by an absence.
            const base = sourceText === undefined ? before : sourceText;
            const text = renderSlotSettings(base, vars);
            if (before !== text) {
                row.wrote = true;
                if (!opts.dryRun) {
                    fs.mkdirSync(path.dirname(target), { recursive: true });
                    fs.writeFileSync(target, text, 'utf8');
                }
            }
        } catch (e) {
            row.error = String((e as Error)?.message ?? e);
        }
        out.push(row);
    }
    return out;
}

/**
 * Read-only: which contract names a slot is missing right now. The Engines card
 * and the acceptance gate ask this; nothing is written.
 */
export function slotSettingsGaps(
    fs: SlotSettingsFs, opts: { dir: string; engine?: string; adapter?: EngineAuthAdapter }
): string[] {
    const a = opts.adapter ?? adapterFor(opts.engine);
    if (!a.requiredEnv) { return []; }
    const target = path.join(opts.dir, a.requiredEnv.file);
    const text = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
    return slotEnvGaps(text, a.requiredEnv.vars);
}
