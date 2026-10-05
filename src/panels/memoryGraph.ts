import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { addMemoryFile, applyIndexFixes, copyMemoryFileTo, IndexFix, planIndexFixes, resolveMemoryFile } from '../core/memusage';
import { buildMergeDraft, findDuplicateGroups, syncGroup } from '../core/memorySync';
import { SessionIndex } from '../core/sessions';
import { handleAfNav, htmlShell } from './base';
import { buildData } from './memoryGraphData';
import { desktopHost, type PanelHost } from './panelHost';

/**
 * Memory Graph: makes the [[wikilink]] structure of each agent's memory
 * visible — links, hubs, islands, broken targets — with recall coloring.
 * Scans file contents on open/refresh only (not on every index tick).
 *
 * ‼️ AND IT IS THE MEMORY SURFACE — U-14, surface 3.
 *
 * This page drew every memory file an agent has and could not create, copy,
 * index, distill, compare or query a single one of them. All six lived in the
 * palette as dialog chains: `syncMemory` was five quickpicks stacked (which
 * file → which action → left copy → right copy → confirm), `addMemory` three
 * boxes, `askMemory` a box whose ANSWER was a quickpick you had to read as
 * one-line labels, `fixMemoryIndex` a multi-pick you could not see the index
 * behind, and `distillMemory` and `copyMemory` a quickpick each.
 *
 * Every one of them is a card on this page now, next to the graph they are
 * about. What stays native, deliberately: `vscode.diff` (a real diff editor is
 * better than anything a webview could draw) and the modal that confirms an
 * overwrite of N files.
 */

export interface MemoryGraphDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    /** Re-read the agent folders and repaint every tree and page. */
    refreshAll?(): void;
    /** `agentFarm.staleMemoryDays` — what counts as a stale memory file. */
    staleDays?(): number;
    /**
     * The fleet-wide semantic query. It needs the embeddings index and the
     * provider config, which live with the host — the page only asks and draws.
     * `onPc` false: a phone asked, so the PC shows no progress for it.
     */
    askMemory?(query: string, onPc?: boolean): Promise<{
        hits?: { agent: string; title: string; score: number; text: string; file: string }[];
        error?: string;
    }>;
    /** Whether an embeddings provider is configured at all. */
    embeddingsOn?(): boolean;
    /**
     * The cheap-model distillation, diff and all. It stays with the host
     * because it needs the judge-model configuration AND because what it ends
     * in — a real diff editor and a decision to overwrite — is deliberately not
     * something a webview draws.
     */
    distill?(agentDir: string, file: string): Promise<{
        error?: string; tokensBefore?: number; tokensAfter?: number; applied?: boolean;
    }>;
    /** Hand a merge draft to the host so "Apply Merged Memory" knows its targets. */
    setPendingMerge?(name: string, files: string[]): void;
}

export class MemoryGraphPanel {
    private static current: MemoryGraphPanel | undefined;
    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<MemoryGraphPanel>();
    private disposables: vscode.Disposable[] = [];

    static show(deps: MemoryGraphDeps, agentId?: string): void {
        if (MemoryGraphPanel.current) {
            MemoryGraphPanel.current.host.reveal();
            MemoryGraphPanel.current.refresh(agentId);
            return;
        }
        MemoryGraphPanel.current = new MemoryGraphPanel(
            desktopHost({ viewType: 'agentfarm.memoryGraph', title: 'Agent Farm — Memory Graph' }), deps, agentId);
    }

    /** X-456 — the page on a phone. A distillation ends in the PC's diff editor and its decision, so it is not built there. */
    static openOn(host: PanelHost, deps: MemoryGraphDeps, agentId?: string): void {
        MemoryGraphPanel.phones.add(new MemoryGraphPanel(host, { ...deps, distill: undefined }, agentId));
    }

    static refreshIfOpen(): void {
        MemoryGraphPanel.current?.refresh();
        for (const p of MemoryGraphPanel.phones) { p.refresh(); }
    }

    /**
     * The ONE door to every memory act. `agentfarm.addMemory`, `copyMemory`,
     * `fixMemoryIndex`, `distillMemory`, `askMemory` and `syncMemory` open this
     * page with the right card up instead of a chain of boxes over whatever
     * happened to be on screen.
     */
    static compose(deps: MemoryGraphDeps, seed: Record<string, unknown>): void {
        MemoryGraphPanel.show(deps, typeof seed.agentId === 'string' ? seed.agentId : undefined);
        void MemoryGraphPanel.current?.host.webview.postMessage({ type: 'mem-compose', seed });
    }

    private constructor(readonly host: PanelHost, private deps: MemoryGraphDeps, agentId?: string) {
        host.webview.html = htmlShell(
            host.webview,
            deps.extensionUri,
            'Memory Graph',
            { ...buildData(deps), selectAgentId: agentId },
            'memgraph.js'
        );
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    refresh(agentId?: string): void {
        void this.host.webview.postMessage({
            type: 'data',
            data: { ...buildData(this.deps), selectAgentId: agentId }
        });
    }

    private agentById(id: string): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === id);
    }

    /** A refusal or a receipt, shown in the card that asked. */
    private say(text: string, ok = false): void {
        void this.host.webview.postMessage({ type: 'mem-msg', text, ok });
    }

    private changed(): void {
        this.deps.refreshAll?.();
        // every view of it — the PC's tab and each phone's — shows the same disk
        MemoryGraphPanel.refreshIfOpen();
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'open':
                if (typeof msg.path === 'string' && msg.path) {
                    void vscode.window.showTextDocument(vscode.Uri.file(msg.path));
                }
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'hafiza-grafigi');
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'mem-save':
                await this.saveMemory((msg.mem ?? {}) as Record<string, unknown>);
                break;
            case 'mem-fix':
                this.applyFixes(String(msg.agentId ?? ''),
                    Array.isArray(msg.lines) ? (msg.lines as unknown[]).map(String) : []);
                break;
            case 'mem-ask':
                await this.ask(String(msg.query ?? ''));
                break;
            case 'mem-distill':
                await this.distill(String(msg.agentId ?? ''), String(msg.path ?? ''));
                break;
            case 'mem-sync':
                await this.sync((msg.act ?? '') as string, msg as Record<string, unknown>);
                break;
        }
    }

    /** New memory file, or a copy of one onto another agent. */
    private async saveMemory(raw: Record<string, unknown>): Promise<void> {
        const s = (k: string) => String(raw[k] ?? '').trim();
        if (s('mode') === 'copy') {
            const target = this.agentById(s('target'));
            if (!target) { return this.say('Pick the agent it is copied to.'); }
            const source = this.agentById(s('agentId'));
            if (!source) { return this.say('Pick the agent the file is copied FROM.'); }
            let src: string;
            // ‼️ The page picks from a list this class built, so the path was
            // never anything but real — but it arrives as a webview string, and
            // the same guard the bridge uses costs nothing here (B-6).
            try { src = resolveMemoryFile(source.dir, s('path')); } catch (e) {
                return this.say((e as Error).message ?? String(e));
            }
            try { copyMemoryFileTo(src, target.dir); } catch (e) {
                return this.say((e as Error).message ?? String(e));
            }
            this.changed();
            return this.say(`Copied to ${target.name} and indexed in its MEMORY.md.`, true);
        }
        const agent = this.agentById(s('agentId'));
        if (!agent) { return this.say('Pick the agent this memory belongs to.'); }
        const name = s('name');
        if (!name) { return this.say('It needs a file name — kebab-case, without the .md.'); }
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
            return this.say('Lowercase letters, digits, - and _ only — the name becomes a file name and an index target.');
        }
        const description = s('description');
        if (!description) {
            return this.say('It needs a one-line description — that line IS the index entry, and the index is what the agent reads to decide whether to open the file.');
        }
        let file: string;
        try {
            file = addMemoryFile(agent.dir, name, s('type') || 'project', description);
        } catch (e) {
            return this.say((e as Error).message ?? String(e));
        }
        this.changed();
        if (this.host.remote) { return this.say(`${name}.md created and indexed — write the fact into its body on the PC.`, true); }
        this.say(`${name}.md created and indexed — write the fact into the body.`, true);
        void vscode.window.showTextDocument(vscode.Uri.file(file));
    }

    /**
     * Repair MEMORY.md. The page sends back the exact index LINES it kept
     * ticked, so a plan recomputed between the draw and the press cannot apply
     * a fix the user never saw.
     */
    private applyFixes(agentId: string, lines: string[]): void {
        const agent = this.agentById(agentId);
        if (!agent) { return; }
        const plan = planIndexFixes(agent.dir, agent.memoryFiles);
        const wanted = new Set(lines);
        const fixes: IndexFix[] = plan.filter(f => wanted.has(f.line));
        if (!fixes.length) { return this.say('Nothing was ticked — nothing was written.'); }
        const backup = applyIndexFixes(agent.dir, fixes);
        this.changed();
        const added = fixes.filter(f => f.kind === 'add').length;
        const removed = fixes.length - added;
        this.say(`MEMORY.md updated — ${added} added, ${removed} removed`
            + (backup ? ' (a timestamped .afbak backup is next to it)' : '') + '.', true);
    }

    private async ask(query: string): Promise<void> {
        if (!query.trim()) { return this.say('Type what you are looking for.'); }
        if (!this.deps.askMemory) { return this.say('Semantic memory is not wired in this window.'); }
        void this.host.webview.postMessage({ type: 'mem-asking' });
        const res = await this.deps.askMemory(query.trim(), !this.host.remote);
        if (res.error) { return this.say(res.error); }
        void this.host.webview.postMessage({
            type: 'mem-hits', query, hits: res.hits ?? []
        });
    }

    /**
     * Distil one file with the cheap model, show the diff, and let the person
     * decide. The diff editor stays native on purpose: it is a better reader
     * than anything this page could draw, and the decision after it is a real
     * overwrite.
     */
    private async distill(agentId: string, file: string): Promise<void> {
        const agent = this.agentById(agentId);
        if (!agent || !file) { return; }
        if (!this.deps.distill) { return this.say('Distillation is not wired in this window.'); }
        void this.host.webview.postMessage({ type: 'mem-distilling', path: file });
        const res = await this.deps.distill(agent.dir, file);
        if (res.error) { return this.say(`Distillation failed — ${res.error}`); }
        this.changed();
        this.say(res.applied
            ? `Distilled ✓ — ~${res.tokensBefore ?? '?'} → ~${res.tokensAfter ?? '?'} tokens, with a .afbak backup beside it.`
            : `Draft ready — ~${res.tokensBefore ?? '?'} → ~${res.tokensAfter ?? '?'} tokens. Nothing was written.`,
            true);
    }

    private async sync(act: string, msg: Record<string, unknown>): Promise<void> {
        const name = String(msg.name ?? '');
        const group = findDuplicateGroups(this.deps.getAgents()).find(g => g.name === name);
        if (!group) { return this.say('That file is no longer shared — refresh the page.'); }
        // a comparison and a merge draft open in the PC's editor
        if (this.host.remote && (act === 'diff' || act === 'merge')) {
            return this.say('Comparing and merging open in the PC\'s editor — do that one on the PC.');
        }

        if (act === 'diff') {
            const left = String(msg.left ?? ''), right = String(msg.right ?? '');
            if (!left || !right || left === right) {
                return this.say('Pick two different copies to compare.');
            }
            const l = group.copies.find(c => c.file.path === left);
            const r = group.copies.find(c => c.file.path === right);
            if (!l || !r) { return this.say('One of those copies has moved — refresh the page.'); }
            await vscode.commands.executeCommand('vscode.diff',
                vscode.Uri.file(l.file.path), vscode.Uri.file(r.file.path),
                `${group.name}: ${l.agent.name} ↔ ${r.agent.name}`);
            return;
        }

        if (act === 'merge') {
            this.deps.setPendingMerge?.(group.name, group.copies.map(c => c.file.path));
            const doc = await vscode.workspace.openTextDocument({
                content: buildMergeDraft(group), language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
            this.say(`Edit the draft into the final "${group.name}", then run "Agent Farm: Apply Merged Memory".`, true);
            return;
        }

        if (act !== 'sync') { return; }
        const source = group.copies.find(c => c.file.path === String(msg.source ?? ''));
        if (!source) { return this.say('Choose which copy is the source of truth.'); }
        const targets = group.copies.filter(c => c !== source);
        // ‼️ The modal stays. This overwrites N files at once, and a page-side
        // warning can be missed while the focus is somewhere else. A phone asks it on the phone.
        const yes = await this.host.ask.warn(
            `Overwrite ${targets.length} copies of "${group.name}" with ${source.agent.name}'s version?\n\n`
            + targets.map(t => t.file.path).join('\n')
            + '\n\nTimestamped .afbak backups are created next to each file.',
            { modal: true }, 'Sync');
        if (yes !== 'Sync') { return; }
        const result = syncGroup(group, source.file.path);
        this.changed();
        this.say(result.errors.length
            ? `Synced ${result.written.length}, but: ${result.errors.join('; ')}`
            : `"${group.name}" synced to ${result.written.length} agent(s) — ${result.backups.length} backup(s) kept.`,
            !result.errors.length);
    }

    private dispose(): void {
        if (MemoryGraphPanel.current === this) { MemoryGraphPanel.current = undefined; }
        MemoryGraphPanel.phones.delete(this);
        for (const d of this.disposables) { d.dispose(); }
    }
}
