import * as vscode from 'vscode';
import type { ChainLegLine, ChainsData } from '../core/chainsPage';
import { SayPart, say, saidSentence } from '../core/uiSentence';
import { handleAfNav, htmlShell } from './base';
import type { ProjectRef } from './noticesPanel';
import { desktopHost, type PanelHost } from './panelHost';

/**
 * S-122 — "Chains": every relay chain in one table, read from the record
 * (chains.list's own rows), with the row's legs strip and its controls. Every
 * button is an op the bridge already has; this panel only carries the press to
 * the body that op runs and says what came of it on the page.
 */

/** What a control came to: the sentence (its parts, U-189, drawn in the interface language) and whether it worked. */
export interface ChainsAnswer { ok: boolean; text: string; say?: SayPart[] }

export interface ChainsDeps {
    extensionUri: vscode.Uri;
    build(): ChainsData;
    /** the projects a row's project id is drawn with */
    projects(): ProjectRef[];
    /** baton.legs — the chain's legs, with what each passed on */
    legs(chainId: string): ChainLegLine[];
    /** baton.stop — every waiting or parked baton of the chain; how many were stopped */
    stop(chainId: string): number;
    /** baton.lastLeg — brake (or release) the running leg of this session */
    lastLeg(sessionId: string, on: boolean): { ok: true; sentence: string; say?: SayPart[] } | { ok: false; why: string; say?: SayPart[] };
    /** baton.now — start this waiting baton at once */
    startNow(batonId: string): { ok: true } | { ok: false; why: string; say?: SayPart[] };
    /** baton.setLegs — the legs menu for this chain, asked on the surface that pressed (S-125: a phone answers it there) */
    ceiling(chainId: string, on: Pick<PanelHost, 'ask' | 'remote'>): Promise<void>;
    /** S-141 — chains.pause / chains.resume: the pause menu for this chain, asked on the surface that pressed */
    pause(chainId: string, on: Pick<PanelHost, 'ask'>): Promise<void>;
    /** S-143 — chains.setAccount: the account picker for this chain's next legs, asked on the surface that pressed */
    account(chainId: string, on: Pick<PanelHost, 'ask'>): Promise<void>;
    /** chains.continue */
    cont(q: { chain: string; prompt?: string; why?: string }): ChainsAnswer;
    /** chains.end — closing a working leg is asked on the surface that pressed */
    end(q: { chain: string; why?: string; endSession: boolean }, on: Pick<PanelHost, 'ask'>): Promise<ChainsAnswer>;
    /** chains.endHanging — those of these chains still hanging are ended; no session is closed */
    endHanging(chainIds: string[]): { ended: string[]; refused: { chain: string; why: string }[] };
    /** Fired whenever what the page shows may have moved. */
    onDidChange: vscode.Event<void>;
}

/** A relay leg streams many changes a second; the page redraws at most this often. */
const REDRAW_MS = 1000;
/** Ages and the attention thresholds move with the clock alone; the page is redrawn this often while open. */
const TICK_MS = 60_000;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export class ChainsPanel {
    private static current: ChainsPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private timer: NodeJS.Timeout | undefined;
    private tick: NodeJS.Timeout;

    /** S-123 — `focus`: a chain id the page opens on (its row unfolded, scrolled to, marked once). */
    static show(deps: ChainsDeps, focus?: string): void {
        if (ChainsPanel.current) {
            ChainsPanel.current.host.reveal();
            ChainsPanel.current.refresh();
            if (focus) { void ChainsPanel.current.host.webview.postMessage({ type: 'focus', chainId: focus }); }
            return;
        }
        ChainsPanel.current = new ChainsPanel(desktopHost({ viewType: 'agentfarm.chains', title: 'Agent Farm — Chains' }), deps, focus);
    }

    /** S-125 — a phone's view; `focus` is the chain its ⑂ link named. */
    static openOn(host: PanelHost, deps: ChainsDeps, focus?: string): ChainsPanel {
        return new ChainsPanel(host, deps, focus);
    }

    private constructor(readonly host: PanelHost, private deps: ChainsDeps, focus?: string) {
        host.webview.html = htmlShell(host.webview, deps.extensionUri, 'Chains', { ...this.data(), ...(focus ? { focusChain: focus } : {}) }, 'chains.js');
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => { void this.onMessage(msg); }, null, this.disposables);
        this.disposables.push(deps.onDidChange(() => this.soon()));
        this.tick = setInterval(() => this.refresh(), TICK_MS);
    }

    private soon(): void {
        if (this.timer) { return; }
        this.timer = setTimeout(() => { this.timer = undefined; this.refresh(); }, REDRAW_MS);
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
    }

    private data(): ChainsData & { projects: ProjectRef[] } {
        return { ...this.deps.build(), projects: this.deps.projects() };
    }

    private said(chainId: string, a: ChainsAnswer): void {
        void this.host.webview.postMessage({ type: 'done', chainId, ok: a.ok, text: a.text, ...(a.say ? { say: a.say } : {}) });
        this.refresh();
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        const chain = str(msg.chainId);
        switch (msg.type) {
            case 'refresh': this.refresh(); return;
            case 'afnav': handleAfNav(msg.to); return;
            // a phone never sends it: afRemote.js turns it into the phone's own session page
            case 'openSession': {
                const sid = str(msg.sessionId);
                if (sid) { void vscode.commands.executeCommand('agentfarm.openSession', { sessionId: sid }); }
                return;
            }
            case 'legs': {
                if (!chain) { return; }
                void this.host.webview.postMessage({ type: 'legs', chainId: chain, legs: this.deps.legs(chain) });
                return;
            }
            case 'stop': {
                if (!chain) { return; }
                const n = this.deps.stop(chain);
                const s = saidSentence(n === 1 ? say('Chain {chain} stopped — {n} waiting baton recorded as stopped; no further leg opens.', { chain, n })
                    : n ? say('Chain {chain} stopped — {n} waiting batons recorded as stopped; no further leg opens.', { chain, n })
                        : say('Nothing in chain {chain} was still waiting — it had already moved on.', { chain }));
                this.said(chain, { ok: n > 0, text: s.sentence, say: s.say });
                return;
            }
            case 'lastLeg': {
                const sid = str(msg.sessionId);
                if (!chain || !sid) { return; }
                const r = this.deps.lastLeg(sid, msg.on === true);
                this.said(chain, r.ok ? { ok: true, text: r.sentence, say: r.say } : { ok: false, text: r.why, say: r.say });
                return;
            }
            case 'now': {
                const id = str(msg.batonId);
                if (!chain || !id) { return; }
                const r = this.deps.startNow(id);
                const s = saidSentence(say('The next leg of chain {chain} goes through the door now.', { chain }));
                this.said(chain, r.ok ? { ok: true, text: s.sentence, say: s.say } : { ok: false, text: r.why, say: r.say });
                return;
            }
            case 'ceiling': {
                if (!chain) { return; }
                await this.deps.ceiling(chain, this.host);
                this.refresh();
                return;
            }
            // S-141 — a right-click on ⑂⊣ (or on a paused row's ▶ / ↻): pause the chain, or continue it
            case 'pauseMenu': {
                if (!chain) { return; }
                await this.deps.pause(chain, this.host);
                this.refresh();
                return;
            }
            case 'account': {
                if (!chain) { return; }
                await this.deps.account(chain, this.host);
                this.refresh();
                return;
            }
            case 'continue': {
                if (!chain) { return; }
                this.said(chain, this.deps.cont({ chain, prompt: str(msg.prompt) || undefined, why: str(msg.why) || undefined }));
                return;
            }
            case 'endHanging': {
                const ids = Array.isArray(msg.chainIds) ? msg.chainIds.map(String).filter(Boolean) : [];
                if (!ids.length) { return; }
                const yes = 'End them';
                const asked = ids.length === 1 ? 'End the hanging chain? It gets its closing record; no session is closed, and it can be continued later.'
                    : `End the ${ids.length} hanging chains? Each gets its closing record; no session is closed, and any of them can be continued later.`;
                if (await this.host.ask.warn(asked, { modal: true }, yes) !== yes) { return; }
                const r = this.deps.endHanging(ids);
                const parts = [say('{n} hanging chain(s) ended — no session was closed; any of them can be continued.', { n: r.ended.length }),
                    ...(r.refused.length ? [say('{n} could not be ended: {list}.', { n: r.refused.length, list: r.refused.map(x => `${x.chain} (${x.why})`).join('; ') })] : [])];
                const s = saidSentence(...parts);
                this.said('', { ok: r.ended.length > 0 && !r.refused.length, text: s.sentence, say: s.say });
                return;
            }
            case 'end': {
                if (!chain) { return; }
                this.said(chain, await this.deps.end({ chain, why: str(msg.why) || undefined, endSession: msg.endSession === true }, this.host));
                return;
            }
        }
    }

    private dispose(): void {
        if (ChainsPanel.current === this) { ChainsPanel.current = undefined; }
        if (this.timer) { clearTimeout(this.timer); }
        clearInterval(this.tick);
        for (const d of this.disposables) { d.dispose(); }
    }
}
