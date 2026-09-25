/**
 * M-46 — THE PALETTE'S HAND ON A RUNNING WORKFLOW: a word for its supervisor
 * (steer · veto · constraint) or a live setting, applied from the next step
 * boundary on. The same TaskManager methods the bridge ops call.
 */
import * as vscode from 'vscode';
import type { TaskManager } from './core/tasks';
import { WAKE_PRESETS, wakePresetConditions } from './core/workflowWake';

interface Action { id: string; label: string; detail: string; word?: 'steer' | 'veto' | 'constraint' }

const WORDS: Action[] = [
    { id: 'wl-steer', word: 'steer', label: '$(comment) Steer', detail: 'Do it this way — the next supervisor decision reads it first.' },
    { id: 'wl-veto', word: 'veto', label: '$(circle-slash) Veto', detail: 'Not this — the next decision must go another way.' },
    { id: 'wl-constraint', word: 'constraint', label: '$(law) Constraint', detail: 'Stay within this — a limit the next decision keeps.' }
];

const SETTINGS: Action[] = [
    { id: 'wl-wake', label: '$(bell) Wake conditions', detail: 'Mechanical · Smart · Hybrid, from the next step on.' },
    { id: 'wl-model', label: '$(hubot) Supervisor model', detail: 'The model its next turns run on. Empty = the workflow\'s.' },
    { id: 'wl-budget', label: '$(credit-card) Supervisor budget $', detail: 'What its turns may cost this run. 0 = none.' },
    { id: 'wl-calls', label: '$(list-ordered) Supervisor calls', detail: 'The most turns it may take this run.' },
    { id: 'wl-callme', label: '$(person) Ask me too at the next decision', detail: 'The supervisor\'s next decision is put to you before it is applied.' },
    { id: 'wl-checkpoint', label: '$(debug-breakpoint) Add a checkpoint', detail: 'Right after the running step, on this run\'s own copy of the chain.' }
];

export async function workflowLiveCommand(m: Pick<TaskManager, 'liveRuns' | 'steerRun' | 'setRunLive'>, runId?: string): Promise<void> {
    const runs = m.liveRuns();
    if (!runs.length) { void vscode.window.showInformationMessage('Agent Farm: no workflow is running.'); return; }
    const run = runId ? runs.find(r => r.runId === runId)
        : runs.length === 1 ? runs[0]
            : (await vscode.window.showQuickPick(runs.map(r => ({ label: r.title, description: r.where, run: r })),
                { title: 'Agent Farm — which running workflow?' }))?.run;
    if (!run) { return; }
    const pause: Action = run.paused
        ? { id: 'wl-resume', label: '$(play) Resume', detail: 'Carry on from where it was held.' }
        : { id: 'wl-pause', label: '$(debug-pause) Pause at the next step boundary', detail: 'The running step finishes; the run then waits for you.' };
    const now = run.live.length ? `\n${run.live.join('\n')}` : '';
    const pick = await vscode.window.showQuickPick([...WORDS, ...SETTINGS, pause].map(a => ({ ...a, label: a.label, detail: a.detail })),
        { title: `Agent Farm — "${run.title}" (${run.where})${now ? ' — live: ' + run.live.length : ''}`, placeHolder: now ? run.live.join(' · ') : 'A word for its supervisor, or a live setting' });
    if (!pick) { return; }
    let r: { error?: string; note?: string };
    if (pick.word) {
        const text = await vscode.window.showInputBox({ title: `${pick.word} — "${run.title}"`, prompt: pick.detail, ignoreFocusOut: true });
        if (!text?.trim()) { return; }
        r = m.steerRun(run.runId, pick.word, text, 'vscode');
    } else {
        const args = await liveArgs(pick.id);
        if (!args) { return; }
        r = m.setRunLive(run.runId, args);
    }
    if (r.error) { void vscode.window.showWarningMessage(`Agent Farm: ${r.error}.`); return; }
    void vscode.window.showInformationMessage(`Agent Farm: "${run.title}" — ${r.note ?? 'done'}.`);
}

async function liveArgs(id: string): Promise<Record<string, unknown> | undefined> {
    switch (id) {
        case 'wl-wake': {
            const p = await vscode.window.showQuickPick(WAKE_PRESETS.map(x => ({ label: x.label, detail: x.describe, id: x.id })), { title: 'Wake the supervisor — from the next step on' });
            return p ? { wake: wakePresetConditions(p.id) } : undefined;
        }
        case 'wl-model': {
            const v = await vscode.window.showInputBox({ title: 'Supervisor model (this run, from now on)', placeHolder: 'claude-haiku-4-5-20251001 — empty = the workflow\'s' });
            return v === undefined ? undefined : { model: v.trim() };
        }
        case 'wl-budget':
        case 'wl-calls': {
            const key = id === 'wl-budget' ? 'budgetUSD' : 'maxCalls';
            const v = await vscode.window.showInputBox({ title: key === 'budgetUSD' ? 'Supervisor budget $ (this run)' : 'Supervisor calls (this run)', validateInput: s => Number.isFinite(Number(s)) && s.trim() !== '' ? undefined : 'a number' });
            return v === undefined ? undefined : { [key]: Number(v) };
        }
        case 'wl-callme': return { callMe: true };
        case 'wl-checkpoint': {
            const v = await vscode.window.showInputBox({ title: 'Add a checkpoint after the running step', prompt: 'What should the supervisor look at there? (optional)' });
            return v === undefined ? undefined : { addCheckpoint: v.trim() || true };
        }
        case 'wl-pause': return { pause: true };
        case 'wl-resume': return { pause: false };
        default: return undefined;
    }
}
