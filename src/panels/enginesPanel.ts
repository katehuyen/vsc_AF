import * as vscode from 'vscode';
import { AccountPolicy } from '../core/accountPolicy';
import { handleAccountsMessage } from './accountsMessages';
import { handlePolicyMessage, PolicyMatrix } from './policyMessages';
import { UsageBar } from '../core/accountUsage';
import { EngineId, EngineStatus } from '../core/engines';
import { EngineTestResult } from '../core/engineTest';
import { ProviderHealthReport, ProviderTestRecord } from '../core/providerHealth';
import { OwnershipRow, PublicProviderProfile } from '../core/providerOwnership';
import { ROUTE_AUTH_KINDS } from '../core/routeAuth';
import { ROUTE_TIERS } from '../core/routeModels';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';

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

/** X-238 — the last run a sign-in carried, as the card draws it. */
export interface AccountLastUseView {
    sessionId: string; at: number; recent: number; agent: string; title: string; file: string;
    /**
     * ‼️ X-333 — WHICH RECORD ANSWERED. A row placed by the launch manifest and
     * one placed by the slot's files having changed are two different claims,
     * and only the first has a session to draw a title or a transcript link
     * beside it. A card that printed them the same way would be inventing the
     * missing half. `whySaid` is the sentence its panel carries.
     */
    why?: string;
    whySaid?: string;
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
     * ‼️ X-114 — THE FREE VERDICT, and it is free because everything in it was
     * already read for another reason. A route with no key, a tier mapped to
     * nothing, a route answered a second time from inside the CLI's own
     * settings file: every one of those starts and fails on an engine the cards
     * above this section call ready, and until this dep existed nothing on the
     * page looked one level down. Async because on OpenCode the whole answer is
     * a catalog that may not have been read yet.
     */
    providerHealth?(): Promise<ProviderHealthReport[]>;
    /**
     * ‼️ …AND THE ONE THAT COSTS A TURN. Same discipline as `test` above: it is
     * pressed, never scheduled, never run on a refresh or a page open. The
     * verdict comes back filed under what it proved.
     */
    providerTest?(engine: string, providerId: string, model: string): Promise<ProviderTestRecord>;
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
        /**
         * X-215 round 2 — EVERY window this account is walled by, each naming
         * itself. The card draws one bar per entry; `percent` above stays the
         * fullest of them, which is what a rotation is decided on.
         */
        bars?: UsageBar[];
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
         * X-238 — the last session this sign-in carried (by its launch manifest),
         * who ran it, and how many ran on it in the last 24 hours. `null` = no
         * run of this farm's was ever sealed on it.
         */
        lastUse?: AccountLastUseView | null;
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
    /** X-238 — open the transcript a card names; the Session Viewer's own command. */
    openSession(file: string): void;
    /**
     * ‼️ X-305 — THE RULES THAT CHOOSE A SIGN-IN AT LAUNCH, and what each comes
     * to right now on every engine that holds a slot. The built-in four are
     * read-only; `rules` are the user's own, editable here. `now` per engine
     * rather than one figure, because a rule is asked about an engine and the
     * page draws the engines side by side.
     */
    policies(): PolicyMatrix;
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
    /**
     * ‼️ X-241 — THE AUTO-REFRESH SWITCH, and what each sign-in's own beat is
     * right now (X-240: seconds while it is working, minutes while it is not).
     * `setAutoRefresh` is the SAME function the bridge's `accounts.autoRefresh`
     * calls, so the button and the op flip one setting the same way.
     */
    autoRefresh(): { on: boolean; beat: { slotId: string; ms: number; active: boolean }[] };
    setAutoRefresh(on: boolean): Promise<unknown>;
    /** who is the authority for which data — the item's first acceptance line,
     *  and it is only met if a person can SEE it */
    ownership(): OwnershipRow[];
    /** every write answers with its refusals, or an empty list */
    /** `edit` = the form was opened on that route; a new one never overwrites an id that exists. */
    saveProfile(input: Record<string, unknown>, edit: boolean): Promise<string[]>;
    removeProfile(id: string): Promise<string[]>;
    copyProfile(id: string): Promise<string[]>;
    profileKey(id: string, label: string): void;
}

function buildData(
    deps: EnginesPanelDeps, verdicts: Map<EngineId, EngineTestResult>,
    health: ProviderHealthReport[] = [], testing: string[] = []
): Record<string, unknown> {
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
        // X-494 — the route form's vocabulary, from the code that acts on it
        routeForm: { authKinds: ROUTE_AUTH_KINDS, tiers: ROUTE_TIERS },
        // ‼️ X-172 — the sign-ins, for the chip on each engine's own card. The
        // empty list is the ordinary answer on a machine that has captured
        // none, and nothing is drawn for it.
        accounts: deps.accounts?.() ?? [],
        // …and what each engine could do about one at all, which is what makes
        // the Capture picker offer only the engines it can really serve.
        accountEngines: deps.accountEngines(),
        // X-241 — the switch and each slot's own beat, drawn on the section head
        autoRefresh: deps.autoRefresh(),
        policies: deps.policies(),
        ownership: deps.ownership(),
        // X-114 — one report per engine that HAS a provider axis. The page
        // draws nothing for an empty list, which is the honest state of a
        // machine whose catalog has not been read.
        providerHealth: health,
        // …and which rows have a turn in the air, so a second press cannot buy
        // a second turn (the same guard `running` gives the engine button).
        providerTesting: testing
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
    /** X-114 — the free verdicts, re-read on every refresh because they cost
     *  nothing; unlike `verdicts`, which are bought. */
    private health: ProviderHealthReport[] = [];
    /** `<engine>/<providerId>` with a real turn in flight. */
    private providerRunning = new Set<string>();
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
            EnginesPanel.current.host.reveal();
            EnginesPanel.current.refresh();
            // ‼️ X-187 — coming back to an open page is the same question as
            // opening one: "what is left of my plan, now". The figures may be
            // minutes old; the service's own TTL decides whether this costs a
            // request at all.
            EnginesPanel.current.live();
            return;
        }
        EnginesPanel.current = new EnginesPanel(desktopHost({ viewType: 'agentfarm.engines', title: 'Agent Farm — Engines' }), deps);
    }

    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<EnginesPanel>();

    /** X-456 — the Engines page on a phone's view. */
    static openOn(host: PanelHost, deps: EnginesPanelDeps): void {
        EnginesPanel.phones.add(new EnginesPanel(host, deps));
    }

    /** After a key was stored or a CLI installed, an open page should not lie. */
    static refreshIfOpen(): void {
        EnginesPanel.current?.refresh();
        for (const p of EnginesPanel.phones) { p.refresh(); }
    }

    private constructor(readonly host: PanelHost, private deps: EnginesPanelDeps) {
        host.webview.html = htmlShell(
            host.webview, deps.extensionUri, 'Engines',
            buildData(deps, this.verdicts, this.health, [...this.providerRunning]), 'engines.js');
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        this.live();
        this.readHealth();
        this.beat = setInterval(() => {
            // A hidden page is not a page anybody is reading. `retainContextWhenHidden`
            // keeps this panel alive behind other tabs, so without this check an
            // Engines tab opened once would go on asking all day for figures
            // nobody is looking at.
            if (this.host.visible) { this.live(); }
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
        void this.host.webview.postMessage({
            type: 'data',
            data: buildData(this.deps, this.verdicts, this.health, [...this.providerRunning])
        });
    }

    /**
     * X-114 — re-read the free verdict and redraw. Separate from `live()`
     * because it answers a different question and must not be able to delay the
     * account beat: a catalog read that hangs would otherwise stop the quota
     * figures refreshing.
     */
    private readHealth(): void {
        if (!this.deps.providerHealth) { return; }
        void Promise.resolve(this.deps.providerHealth())
            .then(rows => { this.health = rows ?? []; this.refresh(); })
            .catch(() => undefined);
    }

    private async onMessage(msg: { type: string;[k: string]: unknown }): Promise<void> {
        // X-236 — the accounts section's presses are answered by the handler both
        // panels share; the switch below is this page's own.
        if (await handleAccountsMessage(msg, this.deps, {
            say: async text => { await this.host.webview.postMessage({ type: 'acc-msg', text }); },
            refresh: () => this.refresh(),
            live: () => this.live(),
            ask: this.host.ask
        })) { return; }
        // X-305 — and the policies section's, by the handler the Accounts page
        // runs too: a rule saved here is the rule the other page lists.
        if (await handlePolicyMessage(msg, this.deps, {
            say: async text => { await this.host.webview.postMessage({ type: 'pol-msg', text }); },
            refresh: () => this.refresh()
        })) { return; }
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
            case 'providerTest':
                await this.runProviderTest(
                    String(msg.engine ?? ''), String(msg.providerId ?? ''), String(msg.model ?? ''));
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
                        ? msg.profile : {}) as Record<string, unknown>, msg.mode === 'edit'), true);
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
    /** `saved` = this answers the route form, which empties itself on success and only then. */
    private async write(refusal: string[], saved = false): Promise<void> {
        if (refusal.length) {
            await this.host.webview.postMessage({ type: 'prov-msg', text: refusal.join(' · ') });
            return;
        }
        await this.host.webview.postMessage({ type: 'prov-msg', text: '', ...(saved ? { saved: true } : {}) });
        this.refresh();
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
            void this.host.webview.postMessage({
                type: 'eng-msg', id,
                text: `${engine.label} is not installed — there is nothing to call yet.`
            });
            return;
        }
        this.running.add(id);
        void this.host.webview.postMessage({ type: 'eng-testing', id });
        try {
            const result = await this.deps.test(id);
            this.verdicts.set(id, result);
        } finally {
            this.running.delete(id);
            this.refresh();
        }
    }

    /**
     * ‼️ ONE REAL TURN THROUGH ONE ROUTE, and every gate the bridge op has.
     * This calls the SAME function `providers.test` calls, so the button and
     * the op cannot come to mean two different things — and the refusal that
     * stops a turn being spent to rediscover a known fault lives in there,
     * once, rather than being re-decided here.
     */
    private async runProviderTest(engine: string, providerId: string, model: string): Promise<void> {
        const key = `${engine}/${providerId}`;
        if (!this.deps.providerTest || !engine || !providerId || this.providerRunning.has(key)) { return; }
        this.providerRunning.add(key);
        this.refresh();
        try {
            await this.deps.providerTest(engine, providerId, model);
        } catch (e) {
            void this.host.webview.postMessage({
                type: 'prov-msg', text: String((e as Error)?.message ?? e)
            });
        } finally {
            this.providerRunning.delete(key);
            // The verdict is filed by the function above, so the free read is
            // what brings it back onto the page — one source, not two.
            this.readHealth();
        }
    }

    private dispose(): void {
        // A phone's view closing leaves the desktop's tab alone.
        if (EnginesPanel.current === this) { EnginesPanel.current = undefined; }
        EnginesPanel.phones.delete(this);
        if (this.beat) { clearInterval(this.beat); this.beat = undefined; }
        for (const d of this.disposables) { d.dispose(); }
    }
}
