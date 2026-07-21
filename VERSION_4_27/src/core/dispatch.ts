import * as cp from 'child_process';
import { extractJson, sanitizePrompt } from './util';

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
    method: 'rule' | 'model' | 'none';
    reason: string;
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
    return new Promise(resolve => {
        const p = sanitizePrompt(classifierPrompt(candidates, text));
        cp.exec(`claude ${judgeArgs.trim()} -p "${p}"`,
            { cwd, timeout: 120_000, windowsHide: true },
            (err, stdout) => {
                const raw = String(stdout ?? '').trim();
                if (err && !raw) {
                    resolve({ reason: 'classifier unavailable (' + String(err.message).slice(0, 80) + ')' });
                    return;
                }
                const json = extractJson(raw) as { agent?: unknown; reason?: unknown } | undefined;
                const name = typeof json?.agent === 'string' ? json.agent.trim() : '';
                const known = candidates.find(c => c.name.toLowerCase() === name.toLowerCase());
                resolve({
                    agent: known?.name,
                    reason: String(json?.reason ?? raw.slice(0, 120)) || '(no reason)'
                });
            });
    });
}

/** Route a piece of text: rules first, then (optionally) the cheap-model classifier. */
export async function dispatchText(
    cwd: string,
    judgeArgs: string,
    text: string,
    rules: DispatchRule[],
    candidates: DispatchCandidate[],
    useClassifier: boolean
): Promise<DispatchResult> {
    const byRule = dispatchByRules(text, rules);
    if (byRule) {
        const known = candidates.find(c => c.name.toLowerCase() === byRule.agent.toLowerCase());
        if (known) {
            return { agent: known.name, method: 'rule', reason: `rule /${byRule.rule}/ matched` };
        }
        return { method: 'none', reason: `rule /${byRule.rule}/ points to unknown agent "${byRule.agent}"` };
    }
    if (useClassifier && candidates.length) {
        const { agent, reason } = await classifyWithModel(cwd, judgeArgs, candidates, text);
        if (agent) { return { agent, method: 'model', reason }; }
        return { method: 'none', reason: 'classifier: ' + reason };
    }
    return { method: 'none', reason: useClassifier ? 'no agents available' : 'no rule matched (classifier off)' };
}
