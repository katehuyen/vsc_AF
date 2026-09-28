import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import { DispatchKapici, DispatchRule, dispatchText } from './dispatch';
import { kapiciFiring, TriggerKapici } from './kapiciTrigger';
import { LiveEvent, LiveMonitor } from './live';
import { FarmTrigger, RunDimensions, runExtras, TaskManager, TaskMode } from './tasks';
import { normPath, safeReadFile, truncate } from './util';
import { triggerInputs } from './workflowInputs';

export interface DispatchOptions {
    judgeArgs: () => string;
    rules: () => DispatchRule[];
    useClassifier: () => boolean;
    /** agentFarm.kapici.dispatch — undefined when off */
    kapici?: () => DispatchKapici | undefined;
}

/**
 * A1 — Triggers: fires tasks/workflows from filesystem changes (watch) or
 * live hook events, with debounce / cooldown / hourly-cap storm protection.
 * Definitions live in TaskManager's store; this class arms and fires them.
 */
export class TriggerManager implements vscode.Disposable {
    private watchers = new Map<string, fs.FSWatcher>();       // triggerId -> watcher
    private debounces = new Map<string, NodeJS.Timeout>();    // triggerId -> pending fire
    /** M-38 — the last path a watch saw change, handed to the firing as {file} */
    private changed = new Map<string, string>();
    private disposables: vscode.Disposable[] = [];
    private armedKey = '';
    /** M-59 — triggers whose Kapıcı precondition is being asked; a second firing meanwhile is skipped */
    private asking = new Set<string>();

    constructor(
        private tasks: TaskManager,
        private getAgents: () => AgentInfo[],
        live?: LiveMonitor,
        private dispatchOpts?: DispatchOptions,
        private kapici?: () => TriggerKapici | undefined
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
                const root = trigger.watchPath;
                const watcher = fs.watch(root, { recursive: isDir }, (_ev, name) => {
                    this.changed.set(trigger.id, isDir && name ? path.join(root, String(name)) : root);
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
            const file = this.changed.get(triggerId);
            this.changed.delete(triggerId);
            this.tryFire(trigger, 'watch change', undefined, file);
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

    /**
     * Fire if every brake allows it. Order matters — cheapest check first, and
     * every one of these runs BEFORE a model is ever spawned:
     *   1. cooldown / hourly cap  — frequency brakes (how often)
     *   2. the farm gate          — master switch · pause-until · quiet hours
     *   3. the PRECONDITION       — content brake (is there actually work?)
     *   4. a Kapıcı precondition   — the only asynchronous one, asked last (M-59)
     * A watch trigger fires on any filesystem change, including noise that has
     * nothing to do with the job; without step 3 the only way to learn "there
     * was nothing to do" was to pay for a full agent wake-up.
     */
    tryFire(trigger: FarmTrigger, reason: string, payload?: unknown, file?: string): boolean {
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
        const gate = this.tasks.automationGate(new Date());
        if (gate) { return this.skip(trigger, gate.reason); }
        const pre = this.tasks.checkPrecondition(trigger.fireIf);
        if (!pre.ok) { return this.skip(trigger, pre.detail); }
        if (trigger.fireIf?.kind === 'kapici') { return this.askKapici(trigger, reason, payload, file); }
        return this.fire(trigger, reason, payload, file);
    }

    /** Accepted now, decided when Kapıcı answers; the trigger is read again then, so a trigger disabled meanwhile does not fire. */
    private askKapici(trigger: FarmTrigger, reason: string, payload?: unknown, file?: string): boolean {
        if (this.asking.has(trigger.id)) { return this.skip(trigger, 'Kapıcı is still deciding the previous firing'); }
        this.asking.add(trigger.id);
        void kapiciFiring(trigger.fireIf!, { title: trigger.title, reason, file, watch: trigger.watchPath, payload }, this.kapici?.())
            .then(v => {
                const t = this.tasks.triggers.find(x => x.id === trigger.id);
                if (!t || !t.enabled) { return; }
                if (v.fire) { this.fire(t, reason, payload, file); } else { this.skip(t, v.detail); }
            })
            .finally(() => this.asking.delete(trigger.id));
        return true;
    }

    /** A suppressed firing: no agent woken, no cost — but never silent. */
    private skip(trigger: FarmTrigger, reason: string): boolean {
        this.tasks.markTriggerSkipped(trigger, reason);
        return false;
    }

    fire(trigger: FarmTrigger, reason: string, payload?: unknown, file?: string): boolean {
        if (trigger.action.kind === 'workflow') {
            const act = trigger.action;
            const w = this.tasks.workflows.find(x => x.id === act.workflowId);
            if (!w) {
                this.tasks.markTriggerFired(trigger);
                void vscode.window.showWarningMessage(
                    `Agent Farm: trigger "${trigger.title}" points to a missing workflow.`);
                return true;
            }
            // ‼️ M-38 — what the trigger knows (the changed file, the watched
            // path, a webhook's payload) becomes the run's inputs; a run that
            // would miss a required one is skipped, and says which.
            const inputs = triggerInputs(w.inputs, act.inputs, { watch: trigger.watchPath, file, payload });
            const refusal = this.tasks.workflowRunRefusal(w, inputs, 'trigger');
            if (refusal) { return this.skip(trigger, refusal); }
            this.tasks.markTriggerFired(trigger);
            void vscode.window.showInformationMessage(
                `Agent Farm: trigger "${trigger.title}" fired (${reason}) → workflow "${w.title}".`);
            // ‼️ X-73 — NOBODY WAS LOOKING WHEN THIS FIRED. A trigger goes off
            // on its own schedule, so the project the window happens to be
            // showing is not the chain's project: the key is passed EMPTY,
            // which is how a caller says "no project" rather than "inherit".
            this.tasks.runWorkflow(w, { projectId: undefined, inputs, inputSource: 'trigger' });
            return true;
        }
        this.tasks.markTriggerFired(trigger);
        const action = trigger.action;
        const payloadStr = payload === undefined ? ''
            : (typeof payload === 'string' ? payload : JSON.stringify(payload)).slice(0, 500);
        const substitute = (s: string) =>
            s.split('{watch}').join(trigger.watchPath ?? '').split('{file}').join(file ?? '').split('{payload}').join(payloadStr);

        if (action.kind === 'dispatch') {
            void this.fireDispatch(trigger, action, reason, substitute(action.prompt), payloadStr);
            return true;
        }
        const agent = this.getAgents().find(a => a.id === action.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: trigger "${trigger.title}" points to a missing agent.`);
            return true;
        }
        const prompt = substitute(action.prompt);
        // The project is the trigger's own declaration and nothing else: a
        // trigger fires off a file change or a webhook, not off a person working
        // in a project, so the window is never read (see TaskManager.addTask).
        const task = this.tasks.addTask(agent, action.title, prompt, action.mode,
            { fromTrigger: trigger.id, projectId: action.projectId || undefined, ...runExtras(action) });
        void vscode.window.showInformationMessage(
            `Agent Farm: trigger "${trigger.title}" fired (${reason}) → task "${action.title}".`);
        this.tasks.startTask(task);
        return true;
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
            process.cwd(), opts.judgeArgs(), routeText, opts.rules(), candidates, opts.useClassifier(), opts.kapici?.());
        if (!result.agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: dispatch trigger "${trigger.title}" found no agent — ${result.reason}.`);
            return;
        }
        const agent = this.getAgents().find(a => a.name === result.agent);
        if (!agent) { return; }
        const dims = action as RunDimensions;
        const task = this.tasks.addTask(agent, `${action.title} → ${agent.name}`, prompt, action.mode,
            { fromTrigger: trigger.id, projectId: dims.projectId || undefined, ...runExtras(dims) });
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
