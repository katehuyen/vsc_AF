import { SpendLedger, withinBudget } from './messaging';
import { splitAgentPrompt } from './telegramCommands';

/**
 * ‼️ U-138 — THE PHONE AS A DOOR THAT OPENS A CONVERSATION, NOT ONLY A RUN.
 *
 * `/agent <name> <prompt>` is a headless run: it answers once, in the thread,
 * and there is nothing to steer. `/new <name> [prompt]` opens a real Console
 * session instead — the one /sessions numbers, the turn cards (U-114) report
 * and the busy queue (U-115) waits on — started through the same seed/record
 * layer as every other launch door, in the agent's own folder like every
 * Console card.
 *
 * ‼️ THE NAME IS NEVER GUESSED. With an argument, it has to start with an
 * agent's name (longest match — a folder name can carry a space); a typo that
 * fell back to the bound agent would start a conversation nobody asked for
 * with the typo inside its first prompt. Only a bare `/new` means the agent
 * this chat is bound to.
 *
 * ‼️ AND THE BUDGET IS ASKED BEFORE ANYTHING SPAWNS. A conversation opened
 * from the phone is billed against the phone's daily cap for as long as it
 * lives (its cost mark is set at 0 the moment it opens), so a cap already
 * spent refuses the door rather than the first turn.
 */
export type PhoneLaunch =
    | { do: 'start'; agent: string; prompt: string }
    | { do: 'refuse'; text: string };

export function phoneLaunchVerdict(i: {
    arg: string;
    names: string[];
    bound?: string;
    ledger: SpendLedger;
    capUSD: number;
    day: string;
    spent: string;
    cap: string;
}): PhoneLaunch {
    const arg = String(i.arg ?? '').trim();
    let agent: string | undefined;
    let prompt = '';
    if (arg) {
        const split = splitAgentPrompt(arg, i.names);
        if (!split) {
            return { do: 'refuse', text: `No agent called "${arg.split(/\s+/)[0]}". /new <agent> [prompt] — /agents lists them.` };
        }
        agent = split.agent;
        prompt = split.prompt;
    } else {
        agent = i.names.find(n => i.bound && n.toLowerCase() === i.bound.toLowerCase());
        if (!agent) {
            return { do: 'refuse', text: 'Which agent? /new <agent> [prompt] opens a Console session — /agents lists them.' };
        }
    }
    if (!withinBudget(i.ledger, i.capUSD, i.day)) {
        return {
            do: 'refuse',
            text: `Today's chat budget is used up (${i.spent} of ${i.cap}). `
                + 'Raise agentFarm.telegram.maxDailyUSD or wait for tomorrow.'
        };
    }
    return { do: 'start', agent, prompt };
}

/** What the phone is told once the card exists — its number is the one /focus takes. */
export function phoneOpenedText(label: string, n: number, prompt: string): string {
    return [
        `▶ ${label} — a Console session is open (#${n} in /sessions) and this chat is focused on it.`,
        prompt ? 'Its first turn is running; the card comes here when it ends.' : 'It is waiting for its first message — just type it.',
        'Plain messages go to it; one written while it works waits for the turn to end.'
    ].join('\n');
}
