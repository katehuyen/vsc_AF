import * as vscode from 'vscode';
import { buildLivingReport, LivingCheck, LivingInput } from '../core/living';
import { handleAfNav, handleFormBrowse, htmlShell } from './base';

/**
 * Living page — "is the system alive today?" on one screen.
 *
 * Every other page reports on a part. This one reports on the LOOPS: something
 * opened — did it close? It exists because the parts can all be green while the
 * system is dead (the daily cycle stopped for 16 days while the safety-net duty
 * ran correctly every morning and its reminder went unread).
 *
 * All the judgment lives in core/living.ts; this panel only injects the farm's
 * current state and renders.
 */

export interface LivingDeps {
    extensionUri: vscode.Uri;
    /** everything core/living needs, assembled by the host */
    snapshot: () => LivingInput;
    /** re-render triggers (task store, notices, queue) */
    onDidChange: vscode.Event<void>;
    checks: () => LivingCheck[];
    /** Write the whole list back to `agentFarm.livingChecks` (U-14). */
    setChecks?(next: LivingCheck[]): Promise<void>;
}

export class LivingPanel {
    private static current: LivingPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: LivingDeps): void {
        if (LivingPanel.current) {
            LivingPanel.current.panel.reveal();
            LivingPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.living',
            'Agent Farm — Living',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        LivingPanel.current = new LivingPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        LivingPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: LivingDeps) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Agent Farm Living',
            this.data(), 'livingPage.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.disposables.push(deps.onDidChange(() => this.refresh()));
    }

    /** Open the page with the checks editor already up — U-14, surface 4. */
    static compose(deps: LivingDeps): void {
        LivingPanel.show(deps);
        void LivingPanel.current?.panel.webview.postMessage({ type: 'checks-compose' });
    }

    private data(): Record<string, unknown> {
        const input = this.deps.snapshot();
        const checks = this.deps.checks();
        const report = buildLivingReport({ ...input, checks });
        return {
            ...report,
            hasChecks: checks.length > 0,
            // ‼️ THE CHECKS THEMSELVES, so the page can edit them (U-14).
            // `configureLivingChecks` was a quickpick that led to five more
            // boxes, and the one thing it never showed was the list it was
            // adding to — so "do I already have a check for this?" could only
            // be answered by opening settings.json.
            checks: checks,
            canEdit: !!this.deps.setChecks
        };
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: this.data() });
    }

    private say(text: string, ok = false): void {
        void this.panel.webview.postMessage({ type: 'checks-msg', text, ok });
    }

    /**
     * Write the whole list back. The page sends the list it drew, so a reorder,
     * an edit and a delete are one write each rather than one command each —
     * and `Cancel` really cancels, because nothing is written until Save.
     */
    private async saveChecks(raw: unknown): Promise<void> {
        if (!this.deps.setChecks) { return; }
        const rows = Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
        const next: LivingCheck[] = [];
        for (const r of rows) {
            const label = String(r.label ?? '').trim();
            if (!label) { return this.say('Every check needs a name — it is the row you will read on this page.'); }
            const kind = String(r.kind ?? '');
            if (!kind) { return this.say(`"${label}" has no condition. A check with nothing to test is a row that is always green.`); }
            const path = String(r.path ?? '').trim();
            if (kind !== 'queueHasWork' && !path) {
                return this.say(`"${label}" looks at a path — say which one.`);
            }
            const when: Record<string, unknown> = { kind };
            if (kind !== 'queueHasWork') { when.path = path; }
            if (kind === 'folderHasFiles') {
                const except = String(r.except ?? '').split(',').map(s => s.trim()).filter(Boolean);
                if (except.length) { when.except = except; }
                if (r.recursive === true) { when.recursive = true; }
            }
            if (kind === 'pathChangedWithin') { when.hours = Number(r.hours) || 24; }
            if (kind === 'folderHasFiles' || kind === 'queueHasWork') {
                const min = Number(r.minCount) || 1;
                if (min > 1) { when.minCount = min; }
            }
            next.push({
                label,
                when: when as unknown as LivingCheck['when'],
                level: (['info', 'warn', 'alert'].indexOf(String(r.level)) >= 0
                    ? String(r.level) : 'warn') as LivingCheck['level'],
                hint: String(r.hint ?? '').trim() || undefined
            });
        }
        await this.deps.setChecks(next);
        this.refresh();
        this.say(next.length
            ? `${next.length} check(s) saved — they are rows on this page from now on.`
            : 'Every check removed. This page now reports only on the farm, not on the work it exists for.',
            true);
    }

    private onMessage(msg: { type: string; to?: string;[k: string]: unknown }): void {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'goto':
                handleAfNav(msg.to);
                break;
            case 'checks-save':
                void this.saveChecks(msg.checks);
                break;
            case 'af-browse':
                void handleFormBrowse(this.panel.webview, msg);
                break;
            case 'openSettingsJson':
                void vscode.commands.executeCommand('workbench.action.openSettingsJson');
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'yasam-panosu');
                break;
        }
    }

    private dispose(): void {
        LivingPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
