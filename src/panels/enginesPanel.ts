import * as vscode from 'vscode';
import { AccountPolicy, PolicyStep } from '../core/accountPolicy';
import { EngineId, EngineStatus } from '../core/engines';
import { EngineTestResult } from '../core/engineTest';
import { OwnershipRow, PublicProviderProfile } from '../core/providerOwnership';
import { handleAfNav, htmlShell } from './base';

/**
 * Engines — the page that answers "what can this machine actually run, and why
 * not" (X-3 / X-14).
 *
 * ‼️ WHY IT IS ITS OWN PANEL. Phase 1 shipped this as a section inside Farm
 * Settings, deliberately: the item said the placement was to be discussed
 * first, so it went somewhere visible without deciding anything. The user chose
 * a dedicated panel on 2026-08-09, and the reason it earns one is that the
 * questions here are not settings. A setting is a value you edit; an engine is
 * a thing you interrogate — is it installed, how is it paid for, is the grant
 * still good, does a call actually get through. That last one costs money to
 * answer, needs a verdict with an age on it, and has nowhere to live in a list
 * of `agentFarm.*` keys.
 *
 * ‼️ NOTHING HERE HOLDS A CREDENTIAL. The sign-in is the CLI's own command,
 * typed into a real terminal and not run for us; the key route hands over to
 * the vault's own form; the docs link is https only. The page is shipped
 * metadata and verdicts, never a value.
 */

/** X-305 — what a rule comes to on one engine at this moment. */
export interface PolicyNow { engine: string; picks: string; note: string; refusal: string }

/**
 * ‼️ X-305 — THE PAGE HANDS OVER A FORM, NOT A RECORD. Everything the webview
 * posts as a rule goes through this allow-list, so a field the page invented
 * — or one a compromised page appended — is dropped rather than stored. The
 * SHAPE (name, chain, ceilings) is then judged by the core, not here.
 */
export function policyFromForm(input: unknown): AccountPolicy {
    const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const str = (v: unknown): string => String(v ?? '').trim();
    const pct = (v: unknown): number | undefined => {
        const n = typeof v === 'number' ? v : Number(str(v));
        return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const chain: PolicyStep[] = (Array.isArray(o.chain) ? o.chain : []).map((raw): PolicyStep => {
        const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const models = Array.isArray(s.models) ? s.models.map(str).filter(Boolean)
            : str(s.models).split(',').map(x => x.trim()).filter(Boolean);
        const ceiling = pct(s.ceiling);
        return {
            ...(str(s.account) ? { account: str(s.account) } : {}),
            ...(str(s.policy) ? { policy: str(s.policy) } : {}),
            ...(ceiling !== undefined ? { ceiling } : {}),
            ...(models.length ? { models } : {})
        };
    });
    const ceiling = pct(o.ceiling);
    return {
        name: str(o.name),
        chain,
        ...(str(o.note) ? { note: str(o.note) } : {}),
        ...(str(o.engine) ? { engine: str(o.engine).toLowerCase() } : {}),
        ...(ceiling !== undefined ? { ceiling } : {}),
        // X-324 — passed as typed; whether it is a strategy at all is the core's verdict
        ...(str(o.strategy) ? { strategy: str(o.strategy).toLowerCase() as AccountPolicy['strategy'] } : {})
    };
}

export interface EnginesPanelDeps {
    extensionUri: vscode.Uri;
    /** the matrix, read fresh — a CLI can be installed while the page is open */
    engines(): EngineStatus[];
    /** ‼️ one real turn against the engine. Pressed, never scheduled. */
    test(id: EngineId): Promise<EngineTestResult>;
    /** write a command into a terminal WITHOUT running it (install or sign-in) */
    command(command: string): void;
    /** hand the key route to the vault's own form, on that exact name */
    key(name: string): void;
    /**
     * ‼️ X-100 — THE PUBLIC HALF OF EVERY ROUTE, AND THERE IS NO DEP HERE THAT
     * CAN RETURN A CREDENTIAL.
     *
     * The page draws a provider list, so the honest question is not "does it
     * remember to redact" but "was it ever given anything to redact". It was
     * not: `profiles()` returns `PublicProviderProfile[]`, whose only statement
     * about a credential is whether one exists. Typing a key is `profileKey`,
     * which opens the host's own password box — the value never crosses into
     * the webview in either direction.
     */
    profiles(): PublicProviderProfile[];
    /**
     * ‼️ X-172 (first slice) — WHICH SIGN-IN THIS ENGINE IS CURRENTLY PLUGGED
     * INTO, and how much of that plan is left.
     *
     * This page is already the page for "what can this machine run, how is it
     * paid for, is it signed in" — the account is the sub-fact of that last
     * question, which is why X-167 put it here rather than on Secrets (a vault
     * is written and never read back; an account is measured and changed).
     *
     * ‼️ NOTHING SECRET, like everything else on this page: an id, a label, an
     * address, a health verdict and a percentage. There is no dep here that can
     * return a token, so the honest question — "was it ever given anything to
     * redact" — answers no.
     */
    accounts?(): {
        id: string; engine: string; label: string; email: string; plan: string;
        health: string; active: boolean; percent: number; resetsAt: number;
        usageState: string; note: string; capturedAt: number; dir: string;
        /** X-215 — which window `percent` is of ('' = the five-hour one) */
        window: string;
        /** X-215 — 'oauth-credentials' (an endpoint) | 'session-tail' (this disk) | 'none' */
        quotaSource: string;
        /** X-206 — when the FIGURE was read (0 = never), not when the account was filed */
        fetchedAt: number;
        /** X-206 — 'idle' | 'queued' | 'reading', and the place in the line (0 = not waiting) */
        queue: string; queuePlace: number;
        /**
         * X-269 — the fleet guarantees this slot is NOT carrying. Empty is the
         * ordinary answer; a name in here means a session on this account would
         * run under different rules from the fleet's, and the card has to be
         * able to say which.
         */
        settingsGaps: string[];
        /**
         * X-269 — whether this ENGINE guarantees anything at all. An empty
         * `settingsGaps` is two different answers — "nothing missing" and
         * "nothing was ever promised" — and a card that drew the first for the
         * second would state a contract that engine has never had.
         */
        settingsGuarantee: boolean;
        /**
         * X-255 — the agents whose OWN standing sign-in is this slot, by name,
         * and how many agents on this engine stand on one of their own at all.
         * A per-agent account outranks the machine-wide standing choice, so the
         * chip that sets that choice has to be able to say who ignores it.
         */
        standingAgents?: string[];
        pinnedAgents?: number;
        /**
         * X-258 — who is on this sign-in RIGHT NOW. `seats` are this window's own
         * Console rows; `others` counts live processes found in the ENGINE'S OWN
         * registry inside this slot's directory that this window does not host —
         * a terminal, another window, somebody else's SDK. The count is all that
         * can honestly be said about those, and the card says no more.
         */
        onIt?: { seats: { seat: string; who: string; sessionId: string }[]; others: number };
        /**
         * X-258 — this sign-in's place in the rotation, READ off `accountOrder`
         * (whose head is `pickAccount`) rather than worked out again. `null` =
         * not in the line at all: at the ceiling or otherwise unusable, which is
         * a different statement from being last.
         */
        line?: { place: number; of: number } | null;
        /**
         * X-252 — today's spend on this sign-in, from the launch manifests. The
         * percentage above says how close the wall is; this says what was spent
         * getting there. `sessions: 0` means nothing ran on it today (a real
         * answer); `unpriced` counts runs on an engine that states no price, so
         * a 0 there is never drawn as a free one; `unsplit` counts runs that
         * could not be placed in today by day rather than being sliced.
         */
        spentToday?: {
            cost: number; wTokens: number; sessions: number;
            unpriced: number; unsplit: number;
        };
    }[];
    /**
     * ‼️ X-172 — WHAT EACH ENGINE CAN DO ABOUT ACCOUNTS AT ALL, and it is the
     * half that decides whether a Capture button is honest. Three of the five
     * have no verified way to keep two identities apart, so a picker listing
     * them offers a gesture whose only outcome is a refusal. The page does not
     * hide them either — it says why, in the adapter's own words.
     */
    accountEngines(): {
        engine: string; support: string; variable: string | null;
        canCapture: boolean; why: string; layout: string;
    }[];
    /**
     * ‼️ X-172 — THE THREE GESTURES, AND THEY ARE NOT OPTIONAL.
     *
     * `accounts()` is optional because an empty list is the ordinary answer on
     * a machine that has captured none, and nothing is drawn for it. A WRITER
     * is the opposite case: the page draws the button either way, so a missing
     * dep would be a control that looks alive and does nothing. Each answers
     * with the refusal to show, or an empty string when it went through.
     */
    captureAccount(engine: string, label: string): Promise<string>;
    activateAccount(id: string, engine: string): Promise<string>;
    forgetAccount(id: string): Promise<string>;
    /**
     * ‼️ X-219 — OPEN THE WAY BACK for a sign-in that has stopped refreshing.
     * Answers with the refusal to show, or an empty string when a terminal was
     * opened — never with "it worked", because the browser flow it starts can
     * be abandoned halfway and only the disk knows.
     */
    reauthAccount(id: string): Promise<string>;
    /**
     * ‼️ X-269 — PUT THE FLEET'S GUARANTEES BACK into one slot's behaviour file.
     * Required rather than optional for the same reason as the three above: the
     * card draws the control whenever `settingsGaps` is not empty, so a missing
     * dep would be a `[fix]` that looks alive and repairs nothing. Answers with
     * what it had to write — an empty list means the slot was already right.
     */
    repairAccountSettings(id: string): string[];
    /**
     * ‼️ X-284 — THE UMBRELLA OF THE ONE ABOVE. `repairAccountSettings` puts
     * back one clause because the reader asks for that one by name; this puts
     * back every repairable clause the contract has, and answers with the ids
     * it had to write. An empty list means the slot was already whole.
     */
    completeAccount(id: string): string[];
    /**
     * ‼️ X-206 — ASK FOR **THESE** FIGURES, IN A LINE.
     *
     * `readAccounts()` is the beat: one slot per turn, whichever is stalest. A
     * reader deciding which account to switch to has a different question — *how
     * much is left in each of these, now* — and answering it with the round
     * robin means waiting minutes for the one they are looking at.
     *
     * So the page names slots and the host queues them, one read every floor
     * interval. NOT a burst: N accounts are still N requests, spaced. A single
     * id is a TOGGLE, so a card that is waiting can be taken back out of the
     * line; a list is an add, and whatever was already waiting keeps its place.
     */
    queueAccountRefresh(ids: string[], gesture: 'toggle' | 'all'): void;
    /**
     * ‼️ X-305 — THE RULES THAT CHOOSE A SIGN-IN AT LAUNCH, and what each comes
     * to right now on every engine that holds a slot. The built-in four are
     * read-only; `rules` are the user's own, editable here. `now` per engine
     * rather than one figure, because a rule is asked about an engine and the
     * page draws the engines side by side.
     */
    policies(): {
        engines: string[];
        builtIn: { id: string; label: string; detail: string; now: PolicyNow[] }[];
        rules: (AccountPolicy & { now: PolicyNow[] })[];
        ceiling: number;
    };
    /**
     * ‼️ X-305 — THE SAME TWO FUNCTIONS THE BRIDGE'S `policies.save` AND
     * `policies.delete` CALL. The page hands over a FORM; whether the rule
     * could ever choose, whether another rule steps through the one being
     * removed, and the write itself are decided in one place. '' = written.
     */
    savePolicy(rule: AccountPolicy): Promise<string>;
    deletePolicy(name: string): Promise<string>;
    /**
     * ‼️ X-187 — ASK FOR A LIVE READING. NOT OPTIONAL.
     *
     * `accounts()` answers from `AccountUsageService.current()`, which never
     * touches the network. On a cold extension host that cache is EMPTY, so
     * every card drew percent -1 and resetsAt 0 — the page reporting, quite
     * truthfully, that nobody had ever looked. The service had a door for this
     * (`beat()`) and only the bridge was wired to it.
     *
     * Required rather than optional on purpose: a missing dep here is a page
     * that silently goes back to drawing an empty bar, which is the defect
     * itself and would fail silently (Principle 1). One call = one slot; the
     * service takes them in turn behind ONE machine-wide floor, so the panel
     * never names an account and never counts requests.
     */
    readAccounts(): Promise<unknown>;
    /** How often an OPEN page may ask again — the user's own active interval,
     *  the same one the single-account card is tuned to. Two refresh policies in
     *  one codebase is how one of them ends up wrong. */
    accountBeatMs(): number;
    /** who is the authority for which data — the item's first acceptance line,
     *  and it is only met if a person can SEE it */
    ownership(): OwnershipRow[];
    /** every write answers with its refusals, or an empty list */
    saveProfile(input: Record<string, unknown>): Promise<string[]>;
    removeProfile(id: string): Promise<string[]>;
    copyProfile(id: string): Promise<string[]>;
    profileKey(id: string, label: string): void;
}

function buildData(deps: EnginesPanelDeps, verdicts: Map<EngineId, EngineTestResult>): Record<string, unknown> {
    const engines = deps.engines();
    return {
        engines,
        // The verdicts are sent with the matrix so the page never has to ask
        // twice, and each carries its own timestamp: the AGE is the point.
        verdicts: [...verdicts.values()],
        now: Date.now(),
        ready: engines.filter(e => e.ready).length,
        onPlan: engines.filter(e => e.ready && e.auth.mode === 'subscription').length,
        /**
         * ‼️ X-100 — WHAT THE PAGE IS ALLOWED TO KNOW ABOUT A ROUTE.
         *
         * `publicProfile` built this list by NAMING its fields, so there is no
         * credential in it to redact and no shape change can put one there.
         * `hasSecret` is the whole of what it says about one — enough to draw
         * "this route has no key yet", which is the only thing a reader needs.
         */
        profiles: deps.profiles(),
        // ‼️ X-172 — the sign-ins, for the chip on each engine's own card. The
        // empty list is the ordinary answer on a machine that has captured
        // none, and nothing is drawn for it.
        accounts: deps.accounts?.() ?? [],
        // …and what each engine could do about one at all, which is what makes
        // the Capture picker offer only the engines it can really serve.
        accountEngines: deps.accountEngines(),
        policies: deps.policies(),
        ownership: deps.ownership()
    };
}

export class EnginesPanel {
    private static current: EnginesPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    /**
     * ‼️ THE CACHE IS THE WHOLE COST CONTROL. A verdict is kept for as long as
     * the panel lives so looking twice is free; it is never refreshed on its
     * own, never on open, never on a timer. Only the button spends anything.
     */
    private verdicts = new Map<EngineId, EngineTestResult>();
    /** ids with a call in flight — a second press must not buy a second turn */
    private running = new Set<EngineId>();
    /**
     * ‼️ X-187 — ONE TIMER FOR THE PAGE, never one per account. The service
     * already walks the slots in turn behind a single shared floor, so a timer
     * per card would buy nobody a fresher figure and would be exactly the
     * "three accounts, three times the requests" mistake X-170 forbids.
     */
    private beat: ReturnType<typeof setInterval> | undefined;

    static show(deps: EnginesPanelDeps): void {
        if (EnginesPanel.current) {
            EnginesPanel.current.deps = deps;
            EnginesPanel.current.panel.reveal();
            EnginesPanel.current.refresh();
            // ‼️ X-187 — coming back to an open page is the same question as
            // opening one: "what is left of my plan, now". The figures may be
            // minutes old; the service's own TTL decides whether this costs a
            // request at all.
            EnginesPanel.current.live();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.engines',
            'Agent Farm — Engines',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        EnginesPanel.current = new EnginesPanel(panel, deps);
    }

    /** After a key was stored or a CLI installed, an open page should not lie. */
    static refreshIfOpen(): void {
        EnginesPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: EnginesPanelDeps) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Engines', buildData(deps, this.verdicts), 'engines.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        this.live();
        this.beat = setInterval(() => {
            // A hidden page is not a page anybody is reading. `retainContextWhenHidden`
            // keeps this panel alive behind other tabs, so without this check an
            // Engines tab opened once would go on asking all day for figures
            // nobody is looking at.
            if (this.panel.visible) { this.live(); }
        }, Math.max(1000, this.deps.accountBeatMs()));
    }

    /**
     * ‼️ X-187 — ASK, THEN REDRAW.
     *
     * The redraw is the half that is easy to forget: `readAccounts` fills the
     * service's cache, and `accounts()` reads that cache, so a reading with no
     * `refresh` behind it lands somewhere the page never looks again.
     *
     * A failed reading is not an error here. The service answers with the state
     * it managed to reach — `expired`, `error`, rate-limited — and the card
     * says so in its own words; there is nothing for this method to report that
     * the payload does not already carry.
     */
    private live(): void {
        void Promise.resolve(this.deps.readAccounts())
            .catch(() => undefined)
            .then(() => { this.refresh(); });
    }

    private refresh(): void {
        void this.panel.webview.postMessage({
            type: 'data', data: buildData(this.deps, this.verdicts)
        });
    }

    private async onMessage(msg: { type: string;[k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'engineTest':
                await this.runTest(String(msg.id ?? '') as EngineId);
                break;
            case 'engineCommand':
                if (typeof msg.command === 'string' && msg.command) {
                    this.deps.command(msg.command);
                }
                break;
            case 'engineKey':
                if (typeof msg.name === 'string' && msg.name) {
                    this.deps.key(msg.name);
                }
                break;
            /* ---- X-100 — the provider routes Agent Farm holds for Claude ---- */
            case 'providerSave':
                // ‼️ THE PAGE HANDS OVER A FORM, NOT A RECORD. Everything past
                // here goes through `storedProfile`'s allow-list, so a field the
                // webview invented — or one a compromised page appended — is
                // dropped rather than stored.
                await this.write(await this.deps.saveProfile(
                    (msg.profile && typeof msg.profile === 'object'
                        ? msg.profile : {}) as Record<string, unknown>));
                break;
            case 'providerRemove':
                await this.write(await this.deps.removeProfile(String(msg.id ?? '')));
                break;
            case 'providerCopy':
                await this.write(await this.deps.copyProfile(String(msg.id ?? '')));
                break;
            case 'providerKey':
                // ‼️ The value is typed into the HOST's password box and stored
                // in the keychain. It never enters this webview, so there is no
                // moment at which the page holds a credential.
                this.deps.profileKey(String(msg.id ?? ''), String(msg.label ?? msg.id ?? ''));
                break;
            /* ---- X-172 — the sign-ins this machine holds ---------------- */
            //
            // ‼️ EVERY ONE OF THESE CALLS THE FUNCTION THE BRIDGE OP CALLS.
            // The page names an account and an engine; which files move,
            // whether it is allowed at all and what it costs is decided in one
            // place, so `accounts.capture` and this button cannot come to mean
            // two different things.
            case 'accountCapture':
                await this.wroteAccount(await this.deps.captureAccount(
                    String(msg.engine ?? ''), String(msg.label ?? '')));
                break;
            case 'accountActivate':
                // An empty id is a real answer and the way BACK: it clears the
                // engine rather than naming an account, which is the main
                // sign-in — the absence of a choice, not a row.
                await this.wroteAccount(await this.deps.activateAccount(
                    String(msg.id ?? ''), String(msg.engine ?? '')));
                break;
            case 'accountRefresh':
                // ‼️ X-206 — one id is a TOGGLE (press a waiting card again and
                // it leaves the line); a list is "all of these", spaced. The
                // page never counts requests and never names an interval.
                this.deps.queueAccountRefresh(
                    Array.isArray(msg.ids) ? msg.ids.map(String).filter(Boolean) : [],
                    msg.gesture === 'all' ? 'all' : 'toggle');
                this.refresh();
                break;
            case 'accountReauth': {
                // ‼️ X-219 — NOT `wroteAccount`: nothing was written and nobody is
                // signed in yet. Its live reading would spend a request on the very
                // account whose credential is the thing that stopped working.
                const refused = await this.deps.reauthAccount(String(msg.id ?? ''));
                await this.panel.webview.postMessage({ type: 'acc-msg', text: refused });
                if (!refused) { this.refresh(); }
                break;
            }
            case 'accountFixSettings': {
                // X-269 — it cannot refuse: the file is reproduced out of the
                // fleet's own, so the only thing to report is what it had to
                // put back. Silence would read as a dead button.
                const wrote = this.deps.repairAccountSettings(String(msg.id ?? ''));
                await this.panel.webview.postMessage({
                    type: 'acc-msg',
                    text: wrote.length ? `Reproduced ${wrote.join(' · ')}` : 'Already carried every guarantee.'
                });
                this.refresh();
                break;
            }
            case 'accountComplete': {
                // ‼️ X-284 — like the [fix] press above it cannot refuse: every
                // clause is either put back or reported by name. Silence would
                // read as a dead button, and "already whole" is a real answer.
                const put = this.deps.completeAccount(String(msg.id ?? ''));
                await this.panel.webview.postMessage({
                    type: 'acc-msg',
                    text: put.length ? `Put back ${put.join(' \u00b7 ')}` : 'Already carried every clause.'
                });
                this.refresh();
                break;
            }
            case 'accountForget':
                // X-282 — the host shows what goes and what stays, then asks;
                // the folder goes by default, after the slot is drained.
                await this.wroteAccount(await this.deps.forgetAccount(String(msg.id ?? '')));
                break;
            /* ---- X-305 — the rules that choose a sign-in at launch ---------- */
            //
            // ‼️ BOTH CALL THE FUNCTION THE BRIDGE OP CALLS. The page hands over
            // a form; whether the rule could ever choose, whether another rule
            // steps through the one being removed, and the write itself are
            // decided in `savePolicy` / `deletePolicy`, so `policies.save` and
            // this button cannot come to mean two different things.
            case 'policySave':
                await this.wrotePolicy(await this.deps.savePolicy(policyFromForm(msg.policy)));
                break;
            case 'policyDelete':
                await this.wrotePolicy(await this.deps.deletePolicy(String(msg.name ?? '')));
                break;
            case 'engineDocs':
                // https only — a docs button is not a way to open anything else.
                if (typeof msg.url === 'string' && /^https:\/\//.test(msg.url)) {
                    void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
                break;
        }
    }

    /**
     * A refusal is shown WHERE IT HAPPENED, not as a toast that outlives the
     * form. All of them together: a form that reports one fault per press makes
     * the user find them serially.
     */
    private async write(refusal: string[]): Promise<void> {
        if (refusal.length) {
            await this.panel.webview.postMessage({ type: 'prov-msg', text: refusal.join(' · ') });
            return;
        }
        await this.panel.webview.postMessage({ type: 'prov-msg', text: '' });
        this.refresh();
    }

    /**
     * X-172 — the same rule as `write`, for the accounts section: a refusal
     * lands in the section it happened in rather than in a toast that outlives
     * the press. Nothing was written when there is one, so nothing is redrawn.
     */
    private async wroteAccount(refusal: string): Promise<void> {
        await this.panel.webview.postMessage({ type: 'acc-msg', text: refusal });
        // ‼️ X-187 — a gesture that went through changed WHICH accounts there
        // are to have figures for, so the reading is asked for again rather
        // than waiting out the interval on a card that has never been read.
        if (!refusal) { this.live(); }
    }

    /**
     * X-305 — the same rule again, for the policies section: the refusal lands
     * in the form that was submitted. An empty one closes the form and redraws
     * — the page reads `pol-msg` with no text as "written".
     */
    private async wrotePolicy(refusal: string): Promise<void> {
        await this.panel.webview.postMessage({ type: 'pol-msg', text: refusal });
        if (!refusal) { this.refresh(); }
    }

    /**
     * One real turn, and the page is told before and after — a button that goes
     * quiet for ninety seconds is a button somebody presses again.
     */
    private async runTest(id: EngineId): Promise<void> {
        if (!id || this.running.has(id)) { return; }
        const engine = this.deps.engines().find(e => e.id === id);
        if (!engine) { return; }
        if (!engine.cli.found) {
            // Refusing here rather than spending: there is nothing to call.
            void this.panel.webview.postMessage({
                type: 'eng-msg', id,
                text: `${engine.label} is not installed — there is nothing to call yet.`
            });
            return;
        }
        this.running.add(id);
        void this.panel.webview.postMessage({ type: 'eng-testing', id });
        try {
            const result = await this.deps.test(id);
            this.verdicts.set(id, result);
        } finally {
            this.running.delete(id);
            this.refresh();
        }
    }

    private dispose(): void {
        EnginesPanel.current = undefined;
        if (this.beat) { clearInterval(this.beat); this.beat = undefined; }
        for (const d of this.disposables) { d.dispose(); }
    }
}
