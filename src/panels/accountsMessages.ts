/**
 * X-236 — THE ACCOUNTS SECTION'S PRESSES, ANSWERED IN ONE PLACE.
 *
 * `media/afAccounts.js` draws the same cards on the Engines page and on the
 * Accounts page, and every press on them posts the same message. Two switches
 * answering those messages is how one page comes to forget a sign-in and the
 * other to keep it, so the arms live here and each panel hands in the three
 * things that differ: how to say a refusal into ITS section, how to redraw
 * ITSELF, and how to ask for a live reading.
 *
 * ‼️ EVERY ARM CALLS THE FUNCTION THE BRIDGE OP CALLS. The page names an
 * account and an engine; which files move, whether it is allowed at all and
 * what it costs is decided in the dep, so `accounts.capture` and a button
 * cannot come to mean two different things.
 */

import type { PanelAsk } from './panelAsk';

/** The writers the section needs — each answers with the refusal to show, or
 *  an empty string / list when it went through. */
export interface AccountsMessageDeps {
    captureAccount(engine: string, label: string): Promise<string>;
    activateAccount(id: string, engine: string): Promise<string>;
    /** `ask` — whoever is looking at the page is asked (X-447); the desktop's window when absent */
    forgetAccount(id: string, ask?: PanelAsk): Promise<string>;
    reauthAccount(id: string): Promise<string>;
    /** X-530 / X-531 — the life of an account: asleep, awake, signed out */
    disableAccount(id: string): Promise<string>;
    enableAccount(id: string): Promise<string>;
    signOutAccount(id: string): Promise<string>;
    repairAccountSettings(id: string): string[];
    completeAccount(id: string): string[];
    queueAccountRefresh(ids: string[], gesture: 'toggle' | 'all'): void;
    setAutoRefresh(on: boolean): Promise<unknown>;
    /** X-238 — open a transcript the card names (the last session on a sign-in) */
    openSession(file: string): void;
}

/** What differs per page. */
export interface AccountsSurface {
    /** put a line into the section (`acc-msg`); empty clears it */
    say(text: string): Promise<void>;
    /** redraw the page from its data */
    refresh(): void;
    /** ask for a live reading — a gesture that went through changed WHICH
     *  accounts there are to have figures for (X-187) */
    live(): void;
    /** the page's own host's questions (a phone's view asks the phone) */
    ask?: PanelAsk;
}

/**
 * Answers one message when it is the accounts section's; `false` when it is
 * not, so the panel's own switch takes it.
 */
export async function handleAccountsMessage(
    msg: { type: string;[k: string]: unknown }, deps: AccountsMessageDeps, s: AccountsSurface
): Promise<boolean> {
    // X-172 — a refusal lands in the section it happened in rather than in a
    // toast that outlives the press. Nothing was written when there is one.
    const wrote = async (refusal: string): Promise<void> => {
        await s.say(refusal);
        if (!refusal) { s.live(); }
    };
    switch (msg.type) {
        case 'accountCapture':
            await wrote(await deps.captureAccount(String(msg.engine ?? ''), String(msg.label ?? '')));
            return true;
        case 'accountActivate':
            // An empty id is a real answer and the way BACK: it clears the
            // engine rather than naming an account, which is the main sign-in
            // — the absence of a choice, not a row.
            await wrote(await deps.activateAccount(String(msg.id ?? ''), String(msg.engine ?? '')));
            return true;
        case 'accountRefresh':
            // ‼️ X-206 — one id is a TOGGLE (press a waiting card again and it
            // leaves the line); a list is "all of these", spaced. The page
            // never counts requests and never names an interval.
            deps.queueAccountRefresh(
                Array.isArray(msg.ids) ? msg.ids.map(String).filter(Boolean) : [],
                msg.gesture === 'all' ? 'all' : 'toggle');
            s.refresh();
            return true;
        case 'accountsAutoRefresh':
            // X-241 — the same function `accounts.autoRefresh` calls
            await deps.setAutoRefresh(msg.on === true);
            s.refresh();
            return true;
        case 'accountReauth': {
            // ‼️ X-219 — NOT `wrote`: nothing was written and nobody is signed
            // in yet. A live reading would spend a request on the very account
            // whose credential is the thing that stopped working.
            const refused = await deps.reauthAccount(String(msg.id ?? ''));
            await s.say(refused);
            if (!refused) { s.refresh(); }
            return true;
        }
        case 'accountFixSettings': {
            // X-269 — it cannot refuse: the file is reproduced out of the
            // fleet's own, so the only thing to report is what it had to put
            // back. Silence would read as a dead button.
            const put = deps.repairAccountSettings(String(msg.id ?? ''));
            await s.say(put.length ? `Reproduced ${put.join(' · ')}` : 'Already carried every guarantee.');
            s.refresh();
            return true;
        }
        case 'accountComplete': {
            // ‼️ X-284 — like the [fix] press above it cannot refuse: every
            // clause is either put back or reported by name, and "already
            // whole" is a real answer.
            const put = deps.completeAccount(String(msg.id ?? ''));
            await s.say(put.length ? `Put back ${put.join(' · ')}` : 'Already carried every clause.');
            s.refresh();
            return true;
        }
        case 'accountOpenSession': {
            // X-238 — a read: the viewer opens beside the page, nothing is redrawn.
            const file = String(msg.file ?? '');
            if (file) { deps.openSession(file); }
            return true;
        }
        // X-530 / X-531 — each changes which accounts there are figures for, so a live reading follows
        case 'accountDisable':
            await wrote(await deps.disableAccount(String(msg.id ?? '')));
            return true;
        case 'accountEnable':
            await wrote(await deps.enableAccount(String(msg.id ?? '')));
            return true;
        case 'accountSignOut':
            await wrote(await deps.signOutAccount(String(msg.id ?? '')));
            return true;
        case 'accountForget':
            // X-282 — the host shows what goes and what stays, then asks; the
            // folder goes by default, after the slot is drained.
            await wrote(await deps.forgetAccount(String(msg.id ?? ''), s.ask));
            return true;
        default:
            return false;
    }
}
