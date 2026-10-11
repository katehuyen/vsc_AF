/**
 * X-536 — WHAT EVERY SESSION IS TOLD ABOUT AGENT FARM AT ITS START.
 *
 * The start card is the one piece of the manual an agent does not have to go
 * and get: ~300 tokens naming the command, the first call (`farm.guide`) and
 * the five rules that keep a fleet safe. Everything else is fetched on demand.
 *
 * Two channels, never both for one session:
 * - `hook`: Claude Code and Codex fire SessionStart, and the live listener
 *   answers it with this text as additional context — every session on the
 *   machine, launched by Agent Farm or not, while the fleet's hooks are in.
 * - `prompt`: Gemini, Antigravity and OpenCode have no such hook, so a run
 *   Agent Farm starts carries the card in front of its first prompt, the same
 *   way the project brief travels on those engines.
 * `agentFarm.agentManual.startCard` = card (default) · line · off.
 */

import { renderCard } from '../service/manualQuery';

export type StartCardMode = 'card' | 'line' | 'off';

export function normalizeStartCardMode(v: unknown): StartCardMode {
    return v === 'line' || v === 'off' ? v : 'card';
}

/** The engines whose own SessionStart hook carries the card. */
export const HOOK_CARD_ENGINES: readonly string[] = ['claude', 'codex'];

export function startCardText(mode: StartCardMode, template: string, af: string, version: string): string {
    if (mode === 'off') { return ''; }
    if (mode === 'line' || !template.trim()) {
        return `Agent Farm is running on this machine. Drive it yourself with ${af} <op> [key=value ...] [@args.json] `
            + `from the shell (it is not an MCP tool); start with ${af} farm.guide.`;
    }
    return renderCard(template, { af, version });
}

/**
 * The card for a run Agent Farm launches, or '' when the engine's hook will
 * deliver it anyway. `hookLive(engine)` answers whether the fleet's hook is
 * installed for that engine right now; when it is not, the prompt carries it.
 */
export function startCardForLaunch(engine: string | undefined, card: string, hookLive: (engine: string) => boolean): string {
    const e = String(engine || 'claude').toLowerCase();
    if (!card) { return ''; }
    return HOOK_CARD_ENGINES.includes(e) && hookLive(e) ? '' : card;
}

/** How the card sits in front of a first prompt, beside <project-context>. */
export function startCardPrefix(card: string): string {
    const text = String(card ?? '').trim();
    return text ? `<agent-farm>\n${text}\n</agent-farm>\n\n` : '';
}
