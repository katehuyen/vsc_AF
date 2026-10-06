/**
 * X-505 — EVERY SESSION IS TOLD HOW TO REACH AGENT FARM, at its start.
 *
 * The bridge is a shell command (`af.js`), never an MCP tool, on every engine
 * and every account. A model that looks for it in its tool catalog finds
 * nothing and concludes it was left out — measured: a Claude session on a
 * provider route said exactly that, while its account's hooks and MCP servers
 * were the same as every other slot's. Knowing the way in is the system's job,
 * not the model's diligence.
 */
export function bridgeStartText(afPath: string): string {
    return `Agent Farm bridge: run node "${afPath}" <op> [@args.json] from the shell — it is not an MCP tool, `
        + `and every engine and account reaches it the same way. node "${afPath}" farm.ops lists every op.`;
}
