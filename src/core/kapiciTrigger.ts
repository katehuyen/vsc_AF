/**
 * M-59 — Kapıcı as a trigger's precondition ({ kind: 'kapici', rule, input }).
 * The cheap brakes (cooldown, hourly cap, the farm gate) have already passed;
 * this is the last and only asynchronous one. The firing — the trigger, the
 * event, the changed file's content or its git diff, a webhook's payload — is
 * the state. off never asks and fires as if the precondition were not there;
 * shadow fires and audits Kapıcı beside it; on lets a confident verdict decide,
 * and the rule's onFailure decides a failure (closed skips, anything else
 * fires). A skip always carries its reason.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Precondition } from './automation';
import { ConsumerSetting, gate } from './kapici/shadow';
import { KapiciState, KapiciVerdict } from './kapici/types';

/** The built-in rule a kapici precondition asks when it names none. */
export const DEFAULT_TRIGGER_RULE = 'trigger.has-work';
export const TRIGGER_INPUTS = ['file', 'diff'] as const;
export type TriggerInput = typeof TRIGGER_INPUTS[number];

const HEAD_BYTES = 64 * 1024;

/** A kapici precondition's own fields, made safe; undefined when one is present and malformed. */
export function kapiciFields(o: Record<string, unknown>): { rule?: string; input?: TriggerInput } | undefined {
    const out: { rule?: string; input?: TriggerInput } = {};
    if (o.rule !== undefined && o.rule !== '') {
        const rule = typeof o.rule === 'string' ? o.rule.trim() : '';
        if (!/^[\w.-]{1,80}$/.test(rule)) { return undefined; }
        out.rule = rule;
    }
    if (o.input !== undefined && o.input !== '') {
        if (!(TRIGGER_INPUTS as readonly unknown[]).includes(o.input)) { return undefined; }
        out.input = o.input as TriggerInput;
    }
    return out;
}

export interface TriggerKapici {
    mode: ConsumerSetting;
    evaluate(rule: string, state: KapiciState, mode: 'on' | 'shadow', actual?: string): Promise<KapiciVerdict>;
    /** The file's uncommitted change; '' when there is none or no repository. */
    diff?(file: string): Promise<string>;
    log?(line: string): void;
}

export interface FiringContext { title: string; reason: string; file?: string; watch?: string; payload?: unknown }

export interface KapiciFiring { fire: boolean; detail: string; by: 'today' | 'kapici'; verdict?: KapiciVerdict; shadow?: Promise<KapiciVerdict | undefined> }

function head(file: string): string {
    try {
        const fd = fs.openSync(file, 'r');
        try {
            const b = Buffer.alloc(HEAD_BYTES);
            return b.subarray(0, fs.readSync(fd, b, 0, HEAD_BYTES, 0)).toString('utf8');
        } finally { fs.closeSync(fd); }
    } catch { return ''; }
}

/** `git diff` of one file, from its own folder; '' on any failure. */
export function gitDiff(file: string): Promise<string> {
    return new Promise(resolve => {
        execFile('git', ['diff', '--no-color', '--', path.basename(file)],
            { cwd: path.dirname(file), timeout: 3000, maxBuffer: 1024 * 1024, windowsHide: true },
            (err, out) => resolve(err ? '' : String(out ?? '')));
    });
}

/** The firing as Kapıcı's state; `diff` falls back to the content when there is no change to show. */
export async function triggerState(pre: Precondition, ctx: FiringContext, diff?: (file: string) => Promise<string>): Promise<Record<string, unknown>> {
    const s: Record<string, unknown> = { trigger: ctx.title, event: ctx.reason };
    const file = ctx.file ?? ctx.watch;
    if (ctx.payload !== undefined) { s.payload = ctx.payload; }
    if (!file) { return s; }
    s.file = path.basename(file);
    s.path = file;
    if (pre.input === 'diff' && diff) {
        const d = await diff(file).catch(() => '');
        if (d.trim()) { s.diff = d; return s; }
    }
    const text = head(file);
    if (text) { s.content = text; }
    return s;
}

const said = (rule: string, v: KapiciVerdict): string =>
    `Kapıcı: ${rule} — ${v.passed ? 'work' : 'no work'} (${v.reason}; confidence ${v.confidence.toFixed(2)})`;

/** Fire or skip, and why. Never throws: whatever goes wrong fires, as the trigger would without Kapıcı. */
export async function kapiciFiring(pre: Precondition, ctx: FiringContext, k: TriggerKapici | undefined): Promise<KapiciFiring> {
    const rule = pre.rule || DEFAULT_TRIGGER_RULE;
    if (!k || k.mode === 'off') { return { fire: true, detail: `Kapıcı is off for triggers — fired without asking ${rule}`, by: 'today' }; }
    try {
        const state = await triggerState(pre, ctx, k.diff);
        const g = await gate<boolean>({
            mode: k.mode, today: async () => true,
            ask: (m, actual) => k.evaluate(rule, state, m, actual),
            decisionOf: f => (f ? 'pass' : 'reject'), fromVerdict: v => v.passed, log: k.log
        });
        if (g.shadow) { return { fire: true, detail: `Kapıcı watches ${rule} in shadow — fired as today`, by: 'today', shadow: g.shadow }; }
        const v = g.verdict;
        if (g.by === 'kapici' && v) { return { fire: g.value, detail: said(rule, v), by: 'kapici', verdict: v }; }
        if (v?.fallback === 'closed') { return { fire: false, detail: `Kapıcı: ${rule} — ${v.reason}`, by: 'kapici', verdict: v }; }
        return { fire: true, detail: v ? `Kapıcı: ${rule} could not decide — ${v.reason}; fired as without it` : 'fired as without Kapıcı', by: 'today', ...(v ? { verdict: v } : {}) };
    } catch (e) {
        k.log?.(`kapici trigger: ${(e as Error)?.message ?? e} — fired as without it`);
        return { fire: true, detail: 'Kapıcı failed — fired as without it', by: 'today' };
    }
}
