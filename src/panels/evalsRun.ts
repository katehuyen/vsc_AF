import * as vscode from 'vscode';
import type { AgentInfo } from '../core/agents';
import { buildEvalReport, compareRuns, summarizeRun, type EvalCase, type EvalResult, type EvalStore } from '../core/evals';
import type { PanelAsk } from './panelAsk';

/** Who asked for the run: its question goes to whoever is looking; a phone is told, not handed the PC's report. */
export interface EvalRunOn {
    ask: PanelAsk;
    remote: boolean;
    progress(message: string): void;
}

export interface EvalRunEnv {
    store: EvalStore;
    runArgs(): string;
    runSet(agentDir: string, runArgs: string, cases: EvalCase[], log: (message: string) => void): Promise<EvalResult[]>;
    newId(): string;
}

/** One run of an agent's whole set — the summary line, or undefined when nothing ran. */
export async function runEvalsFor(agent: AgentInfo, env: EvalRunEnv, on: EvalRunOn): Promise<string | undefined> {
    const cases = env.store.casesFor(agent.id);
    if (!cases.length) { return undefined; }
    const runArgs = env.runArgs();
    // ‼️ THE MODAL STAYS. One agent call and one judge call per case is real money, and a page-side
    // notice can be missed while the focus is somewhere else; on a phone it is the phone's own sheet.
    const confirm = await on.ask.info(
        `Run ${cases.length} eval case(s) against ${agent.name}?\n\n`
        + `Each case = one agent call (${runArgs || 'agent default model'}) + one cheap judge call.`,
        { modal: true }, 'Run');
    if (confirm !== 'Run') { return undefined; }
    const results = on.remote
        ? await env.runSet(agent.dir, runArgs, cases, m => on.progress(m))
        : await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Agent Farm: evals — ${agent.name}` },
            progress => env.runSet(agent.dir, runArgs, cases, m => progress.report({ message: m })));
    const prev = env.store.lastRun(agent.id);
    const cmp = compareRuns(prev, results);
    env.store.addRun({
        id: env.newId(), agentId: agent.id, agentName: agent.name, ts: Date.now(),
        passed: results.filter(r => r.pass).length,
        failed: results.filter(r => !r.pass).length,
        results
    });
    const summary = `Agent Farm evals — ${agent.name}: ${summarizeRun(results, cmp)}`;
    if (on.remote) { return summary; }
    const doc = await vscode.workspace.openTextDocument({
        content: buildEvalReport(agent.name, results, cmp, prev), language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    void vscode.window.showInformationMessage(summary);
    return summary;
}
