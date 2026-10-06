/**
 * U-202 — "Sound: Read Selection": READ THE TEXT THE USER SELECTED, WHEREVER IT IS.
 *
 * On an Agent Farm page the right-click carries the selection itself (media/afCtx.js
 * stamps `afSelection` on the body's context, and a row's `sessionId` rides along, so
 * a passage of a conversation is read in that conversation's voice). In the editor it
 * is the editor's selection. The reading is `alerts.readNow { text }` — the same
 * cleaner and the same language choice as every other reading.
 */

/** What the menu handed over: the page's selection and the conversation it sits in, if any. */
export function selectionOf(arg: unknown): { text: string; sessionId: string } {
    if (!arg || typeof arg !== 'object') { return { text: '', sessionId: '' }; }
    const o = arg as { afSelection?: unknown; sessionId?: unknown };
    return {
        text: typeof o.afSelection === 'string' ? o.afSelection.trim() : '',
        sessionId: typeof o.sessionId === 'string' ? o.sessionId.trim() : ''
    };
}

export interface ReadSelectionDeps {
    /** The active editor's selected text, '' when it has none. */
    editorSelection(): string;
    /** readNow with { text, sessionId? }. Throws a refusal by name. */
    read(ask: { text: string; sessionId?: string }): Promise<unknown>;
    say(text: string): void;
}

/** The command's body: the page's selection first, else the editor's; refused out loud when there is none. */
export async function readSelection(deps: ReadSelectionDeps, arg?: unknown): Promise<'page' | 'editor' | null> {
    const page = selectionOf(arg);
    const from = page.text ? 'page' : 'editor';
    const text = page.text || deps.editorSelection().trim();
    if (!text) { deps.say('Agent Farm: select some text first, then Sound: Read Selection'); return null; }
    const sessionId = page.text ? page.sessionId : '';
    try {
        // the conversation only lends its voice: a row whose transcript is not on this machine reads in the fleet's
        await deps.read({ text, ...(sessionId ? { sessionId } : {}) }).catch(e => {
            if (!sessionId) { throw e; }
            return deps.read({ text });
        });
        deps.say(`Agent Farm: reading the selection (${text.length.toLocaleString('en-US')} characters)`);
        return from;
    } catch (e) {
        deps.say(`Agent Farm: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}
