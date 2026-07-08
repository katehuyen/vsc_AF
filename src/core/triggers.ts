import * as fs from 'fs';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import { LiveEvent, LiveMonitor } from './live';
import { FarmTrigger, TaskManager } from './tasks';
import { normPath } from './util';

/**
 * A1 — Triggers: fires tasks/workflows from filesystem changes (watch) or
 * live hook events, with debounce / cooldown / hourly-cap storm protection.
 * Definitions live in TaskManager's store; this class arms and fires them.
 */
export class TriggerManager implements vscode.Disposable {
    private watchers = new Map<string, fs.FSWatcher>();       // triggerId -> watcher
    private debounces = new Map<string, NodeJS.Timeout>();    // triggerId -> pending fire
    private disposables: vscode.Disposable[] = [];
    private armedKey = '';

    constructor(
        private tasks: TaskManager,
        private getAgents: () => AgentInfo[],
        live?: LiveMonitor
    ) {
        if (live) {
            this.disposables.push(live.onEvent(ev => this.onHookEvent(ev)));
        }
        this.disposables.push(tasks.onDidChange(() => this.arm()));
        this.arm();
    }

    /** (Re)create watchers for enabled watch triggers. Cheap enough to run on every store change. */
    private arm(): void {
        const key = this.tasks.triggers
            .filter(t => t.type === 'watch' && t.enabled)
            .map(t => `${t.id}:${t.watchPath}`)
            .join('|');
        if (key === this.armedKey) { return; }
        this.armedKey = key;

        for (const w of this.watchers.values()) { w.close(); }
        this.watchers.clear();

        for (const trigger of this.tasks.triggers) {
            if (trigger.type !== 'watch' || !trigger.enabled || !trigger.watchPath) { continue; }
            if (!fs.existsSync(trigger.watchPath)) { continue; }
            // Never watch our own outputs — instant feedback loop.
            if (normPath(trigger.watchPath).includes(normPath(this.tasks.outputsDir))) { continue; }
            try {
                const isDir = fs.statSync(trigger.watchPath).isDirectory();
                const watcher = fs.watch(trigger.watchPath, { recursive: isDir }, () => {
                    this.debouncedFire(trigger.id);
                });
                this.watchers.set(trigger.id, watcher);
            } catch { /* unwatchable path — surfaced via tree status */ }
        }
    }

    isArmed(triggerId: string): boolean {
        return this.watchers.has(triggerId);
    }

    private debouncedFire(triggerId: string): void {
        const trigger = this.tasks.triggers.find(t => t.id === triggerId);
        if (!trigger || !trigger.enabled) { return; }
        const prev = this.debounces.get(triggerId);
        if (prev) { clearTimeout(prev); }
        this.debounces.set(triggerId, setTimeout(() => {
            this.debounces.delete(triggerId);
            this.tryFire(trigger, 'watch change');
        }, Math.max(1, trigger.debounceSec) * 1000));
    }

    private onHookEvent(ev: LiveEvent): void {
        for (const trigger of this.tasks.triggers) {
            if (trigger.type !== 'hook' || !trigger.enabled) { continue; }
            if (trigger.hookEvent && trigger.hookEvent !== ev.kind) { continue; }
            if (trigger.hookAgent && trigger.hookAgent !== ev.agentName) { continue; }
            this.tryFire(trigger, `hook:${ev.kind}${ev.agentName ? ` (${ev.agentName})` : ''}`);
        }
    }

    /** Fire if cooldown and hourly cap allow it. */
    tryFire(trigger: FarmTrigger, reason: string): boolean {
        const now = Date.now();
        if (trigger.lastFiredAt && now - trigger.lastFiredAt < trigger.cooldownSec * 1000) {
            return false;
        }
        const recent = (trigger.recentFirings ?? []).filter(ts => now - ts < 3600_000);
        if (trigger.maxPerHour > 0 && recent.length >= trigger.maxPerHour) {
            void vscode.window.showWarningMessage(
                `Agent Farm: trigger "${trigger.title}" hit its hourly cap (${trigger.maxPerHour}) — skipping.`);
            return false;
        }
        this.fire(trigger, reason);
        return true;
    }

    fire(trigger: FarmTrigger, reason: string): void {
        this.tasks.markTriggerFired(trigger);
        if (trigger.action.kind === 'workflow') {
            const w = this.tasks.workflows.find(x => x.id === (trigger.action as { workflowId: string }).workflowId);
            if (!w) {
                void vscode.window.showWarningMessage(
                    `Agent Farm: trigger "${trigger.title}" points to a missing workflow.`);
                return;
            }
            void vscode.window.showInformationMessage(
                `Agent Farm: trigger "${trigger.title}" fired (${reason}) → workflow "${w.title}".`);
            this.tasks.runWorkflow(w);
            return;
        }
        const action = trigger.action;
        const agent = this.getAgents().find(a => a.id === action.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: trigger "${trigger.title}" points to a missing agent.`);
            return;
        }
        const prompt = action.prompt.split('{watch}').join(trigger.watchPath ?? '');
        const task = this.tasks.addTask(agent, action.title, prompt, action.mode, { fromTrigger: trigger.id });
        void vscode.window.showInformationMessage(
            `Agent Farm: trigger "${trigger.title}" fired (${reason}) → task "${action.title}".`);
        this.tasks.startTask(task);
    }

    dispose(): void {
        for (const w of this.watchers.values()) { w.close(); }
        for (const t of this.debounces.values()) { clearTimeout(t); }
        for (const d of this.disposables) { d.dispose(); }
    }
}
