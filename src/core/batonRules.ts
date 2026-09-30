/**
 * The two rules every relay leg is told on its first line, whichever door
 * opened it (a pass, the failsafe, the user's own template): pass at the line
 * and not before, and a pass that opens nothing is the leg's to repair — only
 * the user ends a chain. And the repair a barren-chain refusal names.
 */

export const RELAY_RULES: readonly string[] = [
    'Pass ONLY when a HANDOVER notice or your quota probe reaches the handover line - never before it: below the line you keep working, and an item that looks too big to finish is started anyway.',
    'A pass that opens no next leg is YOUR failure to repair, not an end. Only the user ends a chain (Last leg, Stop chain, or the leg ceiling they set). For any other refusal - a barren-chain brake, an error, a refused pass - you do not end this run until a next leg is open: remove the cause the refusal names and pass again, or open the next leg yourself (node af.js tasks.add with baton:true, in this folder, your handover as its prompt). Ending a run while the chain stands stopped by anything but the user is forbidden.'
];

/** Said after a barren-chain refusal: an automatic brake, never the user's. */
export const BARREN_REPAIR = 'This is NOT the user\'s brake - do not end the run: open the next leg yourself '
    + '(node af.js tasks.add with baton:true, in this folder, your handover as its prompt) and end only once it is open. '
    + 'If your commits went to a repository this chain does not read, say so in that prompt so the chain can see them.';

/** A user template keeps the rules even when it does not name {relayRules}. */
export function withRelayRules(template: string, tail: string[]): void {
    if (!/\{relayRules\}/.test(template)) { tail.unshift(...RELAY_RULES); }
}
