import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { buildMemoryGraph } from '../core/memgraph';
import {
    addMemoryFile, applyIndexFixes, copyMemoryFileTo, IndexFix, MEMORY_TYPES,
    memoryUsage, planIndexFixes
} from '../core/memusage';
import { buildMergeDraft, DupGroup, findDuplicateGroups, syncGroup } from '../core/memorySync';
import { SessionIndex } from '../core/sessions';
import { handleAfNav, htmlShell } from './base';

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
     */
    askMemory?(query: string): Promise<{
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

const WINDOW_MS = 30 * 24 * 3600 * 1000;

/** A duplicate group as the page needs it — names and paths, no AgentInfo. */
function groupRow(g: DupGroup): Record<string, unknown> {
    return {
        name: g.name,
        identical: g.identical,
        copies: g.copies.map(c => ({
            agentId: c.agent.id, agentName: c.agent.name,
            path: c.file.path, mtime: c.file.mtime, size: c.file.size
        }))
    };
}

function buildData(deps: MemoryGraphDeps): Record<string, unknown> {
    const all = deps.getAgents();
    const agents = all.filter(a => a.memoryFiles.length > 0);
    const staleMs = (deps.staleDays?.() ?? 45) * 24 * 3600 * 1000;
    const now = Date.now();
    return {
        generatedAt: now,
        agents: agents.map(a => ({
            id: a.id,
            name: a.name,
            graph: buildMemoryGraph(a, memoryUsage(deps.index, a.id, WINDOW_MS, a.dir)),
            // The index repair plan, computed here rather than behind a
            // round trip: the button that opens it can then say how many
            // there are before it is pressed.
            fixes: planIndexFixes(a.dir, a.memoryFiles),
            // What a distillation would be offered for. `stale` and `big` are
            // the two reasons the picker used to state as a `description`.
            files: a.memoryFiles
                .filter(f => f.name.toLowerCase() !== 'memory.md')
                .map(f => ({
                    name: f.name, path: f.path, tokens: f.tokens, mtime: f.mtime,
                    staleDays: Math.floor((now - f.mtime) / (24 * 3600 * 1000)),
                    stale: now - f.mtime > staleMs
                }))
        })),
        // ‼️ Every agent, not only the ones with memory: a copy has to be able
        // to land on an agent whose memory folder is still empty.
        allAgents: all.map(a => ({ id: a.id, name: a.name })),
        memoryTypes: MEMORY_TYPES.slice(),
        duplicates: findDuplicateGroups(all).map(groupRow),
        embeddingsOn: deps.embeddingsOn ? deps.embeddingsOn() : false,
        canDistill: !!deps.distill
    };
}

export class MemoryGraphPanel {
    private static current: MemoryGraphPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: MemoryGraphDeps, agentId?: string): void {
        if (MemoryGraphPanel.current) {
            MemoryGraphPanel.current.panel.reveal();
            MemoryGraphPanel.current.refresh(agentId);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.memoryGraph',
            'Agent Farm — Memory Graph',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        MemoryGraphPanel.current = new MemoryGraphPanel(panel, deps, agentId);
    }

    static refreshIfOpen(): void {
        MemoryGraphPanel.current?.refresh();
    }

    /**
     * The ONE door to every memory act. `agentfarm.addMemory`, `copyMemory`,
     * `fixMemoryIndex`, `distillMemory`, `askMemory` and `syncMemory` open this
     * page with the right card up instead of a chain of boxes over whatever
     * happened to be on screen.
     */
    static compose(deps: MemoryGraphDeps, seed: Record<string, unknown>): void {
        MemoryGraphPanel.show(deps, typeof seed.agentId === 'string' ? seed.agentId : undefined);
        void MemoryGraphPanel.current?.panel.webview.postMessage({ type: 'mem-compose', seed });
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: MemoryGraphDeps, agentId?: string) {
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Memory Graph',
            { ...buildData(deps), selectAgentId: agentId },
            'memgraph.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    refresh(agentId?: string): void {
        void this.panel.webview.postMessage({
            type: 'data',
            data: { ...buildData(this.deps), selectAgentId: agentId }
        });
    }

    private agentById(id: string): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === id);
    }

    /** A refusal or a receipt, shown in the card that asked. */
    private say(text: string, ok = false): void {
        void this.panel.webview.postMessage({ type: 'mem-msg', text, ok });
    }

    private changed(): void {
        this.deps.refreshAll?.();
        this.refresh();
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
            try { copyMemoryFileTo(s('path'), target.dir); } catch (e) {
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
        void this.panel.webview.postMessage({ type: 'mem-asking' });
        const res = await this.deps.askMemory(query.trim());
        if (res.error) { return this.say(res.error); }
        void this.panel.webview.postMessage({
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
        void this.panel.webview.postMessage({ type: 'mem-distilling', path: file });
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
        // warning can be missed while the focus is somewhere else.
        const yes = await vscode.window.showWarningMessage(
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
        MemoryGraphPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
