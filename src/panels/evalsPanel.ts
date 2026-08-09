import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { EvalCase, EvalRun, EvalStore } from '../core/evals';
import { handleAfNav, handleFormBrowse, htmlShell } from './base';

/**
 * Evals — the only surface in the sweep that had to be BUILT, not converted.
 *
 * ‼️ EVERY OTHER OBJECT IN THIS EXTENSION HAD A PAGE THAT LISTED IT AND COULD
 * NOT MAKE IT (U-14). Evals had neither. Four commands in the palette —
 * `addEvalCase`, `runEvals`, `reviewEvalCases`, `abTest` — were the whole of
 * it, so a regression suite you had spent an afternoon building could only be
 * read back one quickpick line at a time, and "which cases fail now that
 * passed last week?" had no answer that did not involve re-running everything
 * and reading a generated markdown file.
 *
 * So: the cases, the runs, and the case-by-case verdict of the latest run
 * against the one before it, on one page — and the three acts as cards on it.
 *
 * What deliberately stays native: the **modal** in front of a run (it spends
 * one agent call and one judge call per case, which is real money), the
 * generated **report document** (a markdown editor is a better reader than a
 * webview for a long diff of answers), and the OS **file picker** for a
 * variant-B CLAUDE.md.
 */

export interface EvalsDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    store: EvalStore;
    /** Low-scored sessions and failed verifications — the bad traces a
     *  regression case is normally born from. */
    candidates(agentId: string): {
        id: string; label: string; detail: string; input: string;
        source: EvalCase['source'];
    }[];
    /** Run the whole set for one agent. The confirmation and the report belong
     *  to the host — this only asks for it. */
    run(agentId: string): Promise<void>;
    /** Start an A/B on the agent's CLAUDE.md. `rule` appends one line to the
     *  current file; `file` reads variant B whole from a path. */
    abTest(agentId: string, variant: { rule?: string; file?: string; prompts: string[] }): Promise<string | undefined>;
    /** Open suggestions for this agent — the readiest source of a variant B. */
    suggestions(agentId: string): { id: string; rule: string }[];
    /** What a run costs to say so on the button: the model it runs with. */
    runArgs(): string;
}

function runRow(r: EvalRun): Record<string, unknown> {
    return {
        id: r.id, ts: r.ts, passed: r.passed, failed: r.failed,
        results: r.results.map(x => ({
            caseId: x.caseId, title: x.title, pass: x.pass,
            reason: x.reason, durationMs: x.durationMs
        }))
    };
}

function buildData(deps: EvalsDeps, agentId: string): Record<string, unknown> {
    const agents = deps.getAgents();
    const store = deps.store;
    const counts = new Map(agents.map(a => [a.id, store.cases.filter(c => c.agentId === a.id).length]));
    const id = agents.some(a => a.id === agentId) ? agentId
        : (agents.find(a => (counts.get(a.id) ?? 0) > 0)?.id ?? agents[0]?.id ?? '');
    const agent = agents.find(a => a.id === id);
    const cases = store.cases.filter(c => c.agentId === id);
    const runs = store.runs.filter(r => r.agentId === id).sort((a, b) => b.ts - a.ts);
    const last = runs[0];
    const prev = runs[1];

    // ‼️ THE ONE THING A QUICKPICK COULD NEVER SAY: what changed. A case that
    // passed last time and fails now is a regression; the other way round is a
    // fix. Both are computed here so the page does not have to know the shape
    // of a run.
    const prevBy = new Map((prev?.results ?? []).map(r => [r.caseId, r.pass]));
    const verdicts = (last?.results ?? []).map(r => ({
        caseId: r.caseId,
        pass: r.pass,
        was: prevBy.has(r.caseId) ? prevBy.get(r.caseId) : undefined,
        change: !prevBy.has(r.caseId) ? 'new'
            : prevBy.get(r.caseId) === r.pass ? 'same'
                : (r.pass ? 'fixed' : 'regressed'),
        reason: r.reason,
        durationMs: r.durationMs
    }));

    return {
        agentId: id,
        agents: agents.map(a => ({ id: a.id, name: a.name, cases: counts.get(a.id) ?? 0 })),
        hasClaudeMd: !!agent?.claudeMdPath,
        runArgs: deps.runArgs(),
        cases: cases.map(c => ({
            id: c.id, title: c.title, input: c.input, expectation: c.expectation,
            source: c.source?.kind ?? 'manual', createdAt: c.createdAt, disabled: !!c.disabled
        })),
        candidates: agent ? deps.candidates(agent.id) : [],
        suggestions: agent ? deps.suggestions(agent.id) : [],
        runs: runs.slice(0, 20).map(runRow),
        verdicts,
        lastTs: last?.ts ?? 0,
        prevTs: prev?.ts ?? 0
    };
}

export class EvalsPanel {
    private static current: EvalsPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private agentId = '';

    static show(deps: EvalsDeps, agentId?: string): void {
        if (EvalsPanel.current) {
            EvalsPanel.current.panel.reveal();
            if (agentId) { EvalsPanel.current.agentId = agentId; }
            EvalsPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.evals', 'Agent Farm — Evals', vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true });
        EvalsPanel.current = new EvalsPanel(panel, deps, agentId ?? '');
    }

    static refreshIfOpen(): void {
        EvalsPanel.current?.refresh();
    }

    /** The ONE door to an eval act — the four palette commands land here. */
    static compose(deps: EvalsDeps, seed: Record<string, unknown>): void {
        EvalsPanel.show(deps, typeof seed.agentId === 'string' ? seed.agentId : undefined);
        void EvalsPanel.current?.panel.webview.postMessage({ type: 'ev-compose', seed });
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: EvalsDeps, agentId: string) {
        this.agentId = agentId;
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Evals', buildData(deps, agentId), 'evals.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    refresh(): void {
        const data = buildData(this.deps, this.agentId);
        this.agentId = String(data.agentId ?? '');
        void this.panel.webview.postMessage({ type: 'data', data });
    }

    private say(text: string, ok = false): void {
        void this.panel.webview.postMessage({ type: 'ev-msg', text, ok });
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            case 'afnav': handleAfNav(msg.to); break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'degerlendirme');
                break;
            case 'af-browse':
                void handleFormBrowse(this.panel.webview, msg);
                break;
            case 'ev-agent':
                this.agentId = String(msg.agentId ?? '');
                this.refresh();
                break;
            case 'ev-case-save':
                this.saveCase((msg.form ?? {}) as Record<string, unknown>);
                break;
            case 'ev-case-delete':
                await this.deleteCase(String(msg.id ?? ''));
                break;
            case 'ev-run':
                await this.deps.run(this.agentId);
                this.refresh();
                break;
            case 'ev-ab':
                await this.ab((msg.form ?? {}) as Record<string, unknown>);
                break;
        }
    }

    private saveCase(raw: Record<string, unknown>): void {
        const s = (k: string) => String(raw[k] ?? '').trim();
        const agent = this.deps.getAgents().find(a => a.id === this.agentId);
        if (!agent) { return this.say('Pick an agent first.'); }
        const input = s('input');
        if (!input) { return this.say('A case needs its input — that is the prompt replayed against the agent.'); }
        const expectation = s('expectation');
        if (!expectation) {
            return this.say('A case needs an expectation. It is what the judge is handed; without it there is nothing to be right or wrong about.');
        }
        const cand = this.deps.candidates(agent.id).find(c => c.id === s('from'));
        this.deps.store.addCase({
            agentId: agent.id, agentName: agent.name,
            title: s('title') || input.slice(0, 60),
            input, expectation,
            source: cand?.source ?? { kind: 'manual' }
        });
        this.refresh();
        this.say(`Case added — ${agent.name} now has ${this.deps.store.casesFor(agent.id).length}.`, true);
    }

    private async deleteCase(id: string): Promise<void> {
        const c = this.deps.store.cases.find(x => x.id === id);
        if (!c) { return; }
        // ‼️ A destructive act keeps its modal, deliberately.
        const yes = await vscode.window.showWarningMessage(
            `Delete eval case "${c.title}"?`, { modal: true }, 'Delete');
        if (yes !== 'Delete') { return; }
        this.deps.store.deleteCase(id);
        this.refresh();
        this.say('Case deleted.', true);
    }

    private async ab(raw: Record<string, unknown>): Promise<void> {
        const s = (k: string) => String(raw[k] ?? '').trim();
        if (!this.agentId) { return; }
        const from = s('from');
        const variant: { rule?: string; file?: string; prompts: string[] } = {
            prompts: s('prompts').split(/\r?\n/).map(x => x.trim()).filter(Boolean)
        };
        if (from === 'file') {
            if (!s('file')) { return this.say('Pick the file variant B is read from.'); }
            variant.file = s('file');
        } else {
            const rule = from === 'rule' ? s('rule')
                : (this.deps.suggestions(this.agentId).find(x => x.id === from)?.rule ?? '');
            if (!rule) { return this.say('Variant B needs the rule it adds — one line, appended to the current CLAUDE.md.'); }
            variant.rule = rule;
        }
        if (!variant.prompts.length) {
            return this.say('An A/B needs prompts to compare on. Leave it to the eval cases by ticking "use my cases", or type two to five here, one per line.');
        }
        const err = await this.deps.abTest(this.agentId, variant);
        if (err) { return this.say(err); }
        this.refresh();
        this.say('The comparison is open in an editor.', true);
    }

    private dispose(): void {
        EvalsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
