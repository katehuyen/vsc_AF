import { extractJson, sanitizePrompt } from './util';
import { execOneShot } from './oneShot';
import { ConsumerSetting, gate } from './kapici/shadow';
import { KapiciVerdict } from './kapici/types';

/**
 * F2 — Dispatcher: decides which agent takes an incoming piece of work
 * (webhook payload, watched-file change). Rules first (regex → agent),
 * then an optional cheap-model classifier as fallback.
 */

export interface DispatchRule {
    /** case-insensitive regex tested against the incoming text */
    match: string;
    agent: string;
}

export interface DispatchCandidate {
    name: string;
    /** short role hint (first lines of CLAUDE.md) so the classifier has context */
    hint: string;
}

export interface DispatchResult {
    agent?: string;
    method: 'rule' | 'model' | 'kapici' | 'none';
    reason: string;
}

/** agentFarm.kapici.dispatch: off (default) never calls it; shadow audits beside today's path; on asks it before the classifier. */
export interface DispatchKapici {
    mode: ConsumerSetting;
    /** dispatch.route with the candidates as its options; `actual` = today's pick in shadow mode. */
    evaluate(text: string, options: Record<string, string>, mode: 'on' | 'shadow', actual?: string): Promise<KapiciVerdict>;
    log?(line: string): void;
}

/** First matching rule wins; broken regexes are skipped, not fatal. */
export function dispatchByRules(text: string, rules: DispatchRule[]): { agent: string; rule: string } | undefined {
    for (const rule of rules) {
        if (!rule?.match || !rule.agent) { continue; }
        try {
            if (new RegExp(rule.match, 'i').test(text)) {
                return { agent: rule.agent, rule: rule.match };
            }
        } catch { /* invalid regex — skip */ }
    }
    return undefined;
}

export function classifierPrompt(candidates: DispatchCandidate[], text: string): string {
    const roster = candidates
        .map(c => `${c.name}: ${c.hint || '(tanım yok)'}`)
        .join(' | ');
    return `Sen bir iş dağıtıcısısın. Aşağıdaki GELEN İŞİ hangi ajanın alması gerektiğine karar ver. ` +
        `Ajanlar ve rolleri: ${roster}. ` +
        `Yalnızca şu JSON ile cevap ver: {'agent':'ajanadi','reason':'kisa gerekce'} ` +
        `(çift tırnaklı geçerli JSON; hiçbir ajan uygun değilse agent alanını null yap). ` +
        `GELEN İŞ: ${text.slice(0, 1200)}`;
}

export function classifyWithModel(
    cwd: string, judgeArgs: string, candidates: DispatchCandidate[], text: string
): Promise<{ agent?: string; reason: string }> {
    const p = sanitizePrompt(classifierPrompt(candidates, text));
    // X-260 — through the seam.
    return execOneShot({ cwd, args: judgeArgs, prompt: p, timeoutMs: 120_000 }).then(r => {
        const raw = r.out;
        if (r.error && !raw) {
            return { reason: 'classifier unavailable (' + r.error.slice(0, 80) + ')' };
        }
        const json = extractJson(raw) as { agent?: unknown; reason?: unknown } | undefined;
        const name = typeof json?.agent === 'string' ? json.agent.trim() : '';
        const known = candidates.find(c => c.name.toLowerCase() === name.toLowerCase());
        return {
            agent: known?.name,
            reason: String(json?.reason ?? raw.slice(0, 120)) || '(no reason)'
        };
    });
}

/** Route a piece of text: rules first, then (optionally) the cheap-model classifier. */
export async function dispatchText(
    cwd: string,
    judgeArgs: string,
    text: string,
    rules: DispatchRule[],
    candidates: DispatchCandidate[],
    useClassifier: boolean,
    kapici?: DispatchKapici
): Promise<DispatchResult> {
    const byRule = dispatchByRules(text, rules);
    if (byRule) {
        const known = candidates.find(c => c.name.toLowerCase() === byRule.agent.toLowerCase());
        if (known) {
            return { agent: known.name, method: 'rule', reason: `rule /${byRule.rule}/ matched` };
        }
        return { method: 'none', reason: `rule /${byRule.rule}/ points to unknown agent "${byRule.agent}"` };
    }
    const today = async (): Promise<DispatchResult> => {
        if (useClassifier && candidates.length) {
            const { agent, reason } = await classifyWithModel(cwd, judgeArgs, candidates, text);
            if (agent) { return { agent, method: 'model', reason }; }
            return { method: 'none', reason: 'classifier: ' + reason };
        }
        return { method: 'none', reason: useClassifier ? 'no agents available' : 'no rule matched (classifier off)' };
    };
    if (!kapici || kapici.mode === 'off' || !candidates.length) { return today(); }
    const options = Object.fromEntries(candidates.map(c => [c.name, (c.hint || '').trim() || c.name]));
    const k = kapici;
    return (await gate<DispatchResult>({
        mode: k.mode, today,
        ask: (mode, actual) => k.evaluate(text, options, mode, actual),
        decisionOf: r => r.agent ?? 'none',
        fromVerdict: v => {
            const known = candidates.find(c => c.name.toLowerCase() === v.decision.toLowerCase());
            return known ? { agent: known.name, method: 'kapici', reason: v.reason } : undefined;
        },
        log: k.log
    })).value;
}
