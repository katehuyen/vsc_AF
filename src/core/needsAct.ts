import { NeedItem, needKey } from './needs';

/** Buttons that only move the eye: where an agent reads the same thing instead. */
export const NEED_LOOK_ACTIONS: Record<string, string> = {
    'open-session': 'sessions.read',
    'open-timeline': 'sessions.recent',
    'open-console': 'console.sessions',
    'open-note': 'the file in ref.filePath',
    'open-publish': 'workflows.list',
    'open-tasks': 'tasks.list',
    'open-missions': 'missions.list',
    'focus-terminal': 'sessions.read'
};

/** Buttons that ask the person for typed text on the host; over the bridge the text is passed. */
export const NEED_TYPED_ACTIONS = new Set(['wq-text', 'mission-answer']);

export type NeedActPlan = { error: string } | { item: NeedItem; action: string; answer?: string };

/**
 * ‼️ X-53 — pressing a Needs You button over the bridge. Resolves the row by
 * its needs.list key and the button by its id, and refuses what the page's
 * press would not do headless: a button that only opens a view, and one that
 * would open an input box nobody is there to type into.
 */
export function planNeedAct(items: NeedItem[], key: string, action: string, answer?: string): NeedActPlan {
    const item = items.find(i => needKey(i) === key);
    if (!item) { return { error: `No Needs You row with key "${key}" — it was answered or cleared; needs.list shows the current ones.` }; }
    if (!item.actions.some(a => a.id === action)) {
        return { error: `"${action}" is not a button on that row — its buttons: ${item.actions.map(a => a.id).join(', ') || 'none'}.` };
    }
    const look = NEED_LOOK_ACTIONS[action];
    if (look) { return { error: `"${action}" only opens a view and nothing waits on it — read it with ${look}.` }; }
    const text = String(answer ?? '').trim();
    if (NEED_TYPED_ACTIONS.has(action) && !text) { return { error: `"${action}" asks for typed text — pass answer.` }; }
    return text ? { item, action, answer: text } : { item, action };
}
