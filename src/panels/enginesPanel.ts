import * as vscode from 'vscode';
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

    static show(deps: EnginesPanelDeps): void {
        if (EnginesPanel.current) {
            EnginesPanel.current.deps = deps;
            EnginesPanel.current.panel.reveal();
            EnginesPanel.current.refresh();
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
            case 'accountForget':
                // Bookkeeping only: the directory is left on disk. Deleting
                // somebody's stored sign-in because they tidied a list is not
                // recoverable, so the page is not given that switch at all.
                await this.wroteAccount(await this.deps.forgetAccount(String(msg.id ?? '')));
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
        for (const d of this.disposables) { d.dispose(); }
    }
}
