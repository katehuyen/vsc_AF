import * as fs from 'fs';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import { DispatchRule, dispatchText } from './dispatch';
import { LiveEvent, LiveMonitor } from './live';
import { FarmTrigger, TaskManager, TaskMode } from './tasks';
import { normPath, safeReadFile, truncate } from './util';

export interface DispatchOptions {
    judgeArgs: () => string;
    rules: () => DispatchRule[];
    useClassifier: () => boolean;
}

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
        live?: LiveMonitor,
        private dispatchOpts?: DispatchOptions
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

    /** B3 inbound: fire the webhook trigger matching this token (from /trigger/<token>). */
    fireWebhook(token: string, payload: unknown): boolean {
        const trigger = this.tasks.triggers.find(t =>
            t.type === 'webhook' && t.enabled && t.token === token);
        if (!trigger) { return false; }
        return this.tryFire(trigger, 'webhook', payload);
    }

    /** Fire if cooldown and hourly cap allow it. */
    tryFire(trigger: FarmTrigger, reason: string, payload?: unknown): boolean {
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
        this.fire(trigger, reason, payload);
        return true;
    }

    fire(trigger: FarmTrigger, reason: string, payload?: unknown): void {
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
        const payloadStr = payload === undefined ? ''
            : (typeof payload === 'string' ? payload : JSON.stringify(payload)).slice(0, 500);
        const substitute = (s: string) =>
            s.split('{watch}').join(trigger.watchPath ?? '').split('{payload}').join(payloadStr);

        if (action.kind === 'dispatch') {
            void this.fireDispatch(trigger, action, reason, substitute(action.prompt), payloadStr);
            return;
        }
        const agent = this.getAgents().find(a => a.id === action.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: trigger "${trigger.title}" points to a missing agent.`);
            return;
        }
        const prompt = substitute(action.prompt);
        const task = this.tasks.addTask(agent, action.title, prompt, action.mode, { fromTrigger: trigger.id });
        void vscode.window.showInformationMessage(
            `Agent Farm: trigger "${trigger.title}" fired (${reason}) → task "${action.title}".`);
        this.tasks.startTask(task);
    }

    /** F2: route the firing to the best agent — rules first, cheap-model classifier as fallback. */
    private async fireDispatch(
        trigger: FarmTrigger,
        action: { title: string; prompt: string; mode: TaskMode },
        reason: string,
        prompt: string,
        payloadStr: string
    ): Promise<void> {
        const opts = this.dispatchOpts;
        if (!opts) {
            void vscode.window.showWarningMessage(
                `Agent Farm: trigger "${trigger.title}" is a dispatch trigger but no dispatcher is configured.`);
            return;
        }
        const candidates = this.getAgents().map(a => ({
            name: a.name,
            hint: truncate((safeReadFile(a.claudeMdPath ?? '') ?? '')
                .replace(/^#.*$/m, '').trim(), 160)
        }));
        const routeText = payloadStr || `${trigger.watchPath ?? ''} ${prompt}`.trim();
        const result = await dispatchText(
            process.cwd(), opts.judgeArgs(), routeText, opts.rules(), candidates, opts.useClassifier());
        if (!result.agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: dispatch trigger "${trigger.title}" found no agent — ${result.reason}.`);
            return;
        }
        const agent = this.getAgents().find(a => a.name === result.agent);
        if (!agent) { return; }
        const task = this.tasks.addTask(agent, `${action.title} → ${agent.name}`, prompt, action.mode,
            { fromTrigger: trigger.id });
        void vscode.window.showInformationMessage(
            `Agent Farm: dispatch "${trigger.title}" (${reason}) → ${agent.name} [${result.method}: ${truncate(result.reason, 60)}].`);
        this.tasks.startTask(task);
    }

    dispose(): void {
        for (const w of this.watchers.values()) { w.close(); }
        for (const t of this.debounces.values()) { clearTimeout(t); }
        for (const d of this.disposables) { d.dispose(); }
    }
}
