/**
 * U-187 — THE AGENT STEP OF THE TONE CHAIN, given a surface.
 *
 * `resolveVoice` (core/alertVoices.ts) has always tried session > agent >
 * settings > default; nothing could write the agent step, so it fell through on
 * every resolution. Its values live in `agentFarm.alerts.agentVoices`
 * (`{ "<agent name>": { "<event>": "<voice id>" } }`), the same shape as
 * `alerts.voices` one level down, so settings.json reads the way the page does.
 */

export type AgentVoices = Record<string, Record<string, string>>;

/** One agent's tones as the Sound page's Agents tab draws them. */
export interface AgentSoundRow {
    name: string;
    tones: { event: string; chosen: string; voice: string; origin: string }[];
}

/** The map with one agent's one event set, or cleared by an empty voice. An
 *  agent left with no choice drops out, so a cleared choice leaves no trace. */
export function withAgentVoice(map: AgentVoices, agent: string, event: string, voice: string): AgentVoices {
    const out: AgentVoices = {};
    for (const [k, v] of Object.entries(map || {})) { out[k] = { ...v }; }
    const own = { ...(out[agent] || {}) };
    if (voice) { own[event] = voice; } else { delete own[event]; }
    if (Object.keys(own).length) { out[agent] = own; } else { delete out[agent]; }
    return out;
}

/** Every agent, every event: what it chose, and what actually plays from where. */
export function agentSoundRows(
    names: readonly string[], events: readonly string[], map: AgentVoices,
    resolve: (event: string, agent: string) => { voice: string; origin: string }
): AgentSoundRow[] {
    return [...new Set(names)].sort((a, b) => a.localeCompare(b)).map(name => ({
        name,
        tones: events.map(event => {
            const r = resolve(event, name);
            return { event, chosen: String((map[name] || {})[event] || ''), voice: r.voice, origin: r.origin };
        })
    }));
}
