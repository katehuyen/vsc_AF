import { extractJson, sanitizePrompt } from './util';
import { execOneShot } from './oneShot';

/**
 * F1 — Natural-language command bar: one sentence in ("yarın 09:00'da
 * psikolog haftalık analizi koşsun"), a cheap model turns it into a
 * structured task / schedule / workflow plan, the user approves a
 * human-readable preview, and only then is anything installed.
 */

export interface PlanStep {
    agent: string;
    title: string;
    prompt: string;
}

export interface PlanSchedule {
    kind: 'daily' | 'weekly' | 'once';
    hour?: number;
    minute?: number;
    /** 0 = Sunday … 6 = Saturday (weekly only) */
    dow?: number;
    /** "YYYY-MM-DD HH:MM" local time (once only) */
    onceAt?: string;
}

export interface FarmPlan {
    kind: 'task' | 'schedule' | 'workflow';
    title: string;
    agent?: string;
    prompt?: string;
    schedule?: PlanSchedule;
    steps?: PlanStep[];
}

const DOW_TR = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function buildCommandPrompt(agentNames: string[], utterance: string, now: Date): string {
    const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-` +
        `${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:` +
        `${String(now.getMinutes()).padStart(2, '0')} (${DOW_TR[now.getDay()]})`;
    return `Sen bir görev planlayıcısısın. Kullanıcının doğal dil isteğini aşağıdaki üç JSON şemasından ` +
        `tam olarak BİRİNE çevir ve YALNIZCA geçerli JSON döndür (açıklama yok). ` +
        `Mevcut ajanlar: ${agentNames.join(', ')}. Şu an: ${nowStr}. ` +
        `Şemalar: ` +
        `(1) tek seferlik iş: {'kind':'task','title':'...','agent':'ajanadi','prompt':'ajana verilecek talimat'} ` +
        `(2) zamanlanmış iş: {'kind':'schedule','title':'...','agent':'ajanadi','prompt':'...','schedule':{'kind':'daily'|'weekly'|'once','hour':9,'minute':0,'dow':1,'onceAt':'YYYY-MM-DD HH:MM'}} ` +
        `— weekly ise dow (0=Pazar..6=Cumartesi) ver, once ise onceAt ver (hour/minute gerekmez), daily ise hour+minute yeter. ` +
        `(3) çok adımlı zincir: {'kind':'workflow','title':'...','steps':[{'agent':'ajanadi','title':'adım','prompt':'...'}]} ` +
        `— sonraki adımın prompt'unda {prev_text} önceki adımın çıktısını taşır. ` +
        `Kurallar: agent alanlarında YALNIZCA verilen ajan adlarını kullan; 'yarın' gibi ifadeleri şimdiki zamana göre hesapla; ` +
        `prompt alanını ajanın tek başına anlayacağı eksiksiz bir talimat yap; çift tırnaklı geçerli JSON yaz. ` +
        `İSTEK: ${utterance}`;
}

export function parsePlan(raw: string): { plan?: FarmPlan; error?: string } {
    const json = extractJson(raw) as Partial<FarmPlan> | undefined;
    if (!json || typeof json !== 'object') { return { error: 'model output is not JSON' }; }
    if (json.kind !== 'task' && json.kind !== 'schedule' && json.kind !== 'workflow') {
        return { error: `unknown plan kind "${String(json.kind)}"` };
    }
    return { plan: json as FarmPlan };
}

export function validatePlan(plan: FarmPlan, agentNames: string[]): string[] {
    const errors: string[] = [];
    const known = new Set(agentNames.map(n => n.toLowerCase()));
    const checkAgent = (name: string | undefined, where: string) => {
        if (!name || !known.has(name.toLowerCase())) {
            errors.push(`${where}: "${name ?? ''}" is not one of your agents`);
        }
    };
    if (!plan.title?.trim()) { errors.push('title missing'); }
    if (plan.kind === 'task' || plan.kind === 'schedule') {
        checkAgent(plan.agent, 'agent');
        if (!plan.prompt?.trim()) { errors.push('prompt missing'); }
    }
    if (plan.kind === 'schedule') {
        const s = plan.schedule;
        if (!s) { errors.push('schedule missing'); }
        else if (s.kind === 'once') {
            if (!s.onceAt || isNaN(Date.parse(s.onceAt.replace(' ', 'T')))) {
                errors.push(`onceAt invalid: "${s.onceAt ?? ''}"`);
            }
        } else if (s.kind === 'daily' || s.kind === 'weekly') {
            if (typeof s.hour !== 'number' || s.hour < 0 || s.hour > 23 ||
                typeof s.minute !== 'number' || s.minute < 0 || s.minute > 59) {
                errors.push('schedule time invalid');
            }
            if (s.kind === 'weekly' && (typeof s.dow !== 'number' || s.dow < 0 || s.dow > 6)) {
                errors.push('weekly day (dow) invalid');
            }
        } else {
            errors.push(`schedule kind invalid: "${String(s.kind)}"`);
        }
    }
    if (plan.kind === 'workflow') {
        if (!plan.steps?.length) { errors.push('workflow has no steps'); }
        for (const [i, step] of (plan.steps ?? []).entries()) {
            checkAgent(step.agent, `step ${i + 1} agent`);
            if (!step.prompt?.trim()) { errors.push(`step ${i + 1} prompt missing`); }
        }
    }
    return errors;
}

/** Human-readable preview the user approves before anything is installed. */
export function describePlan(plan: FarmPlan): string {
    if (plan.kind === 'task') {
        return `▶ One-off task: "${plan.title}"\nAgent: ${plan.agent}\nInstruction: ${plan.prompt}`;
    }
    if (plan.kind === 'schedule') {
        const s = plan.schedule!;
        const when = s.kind === 'once'
            ? `once — ${s.onceAt}`
            : s.kind === 'weekly'
                ? `every ${DOW_TR[s.dow ?? 0]} ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
                : `daily ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
        return `📅 Schedule: "${plan.title}"\nAgent: ${plan.agent}\nWhen: ${when}\nInstruction: ${plan.prompt}`;
    }
    const steps = (plan.steps ?? [])
        .map((s, i) => `  ${i + 1}. [${s.agent}] ${s.title || s.prompt.slice(0, 50)}: ${s.prompt.slice(0, 120)}`)
        .join('\n');
    return `⛓ Chain: "${plan.title}" (${plan.steps?.length} steps)\n${steps}`;
}

/** One cheap-model call: utterance → validated plan (or errors + raw output for debugging). */
export function interpretCommand(
    cwd: string, judgeArgs: string, agentNames: string[], utterance: string, now = new Date()
): Promise<{ plan?: FarmPlan; errors: string[]; raw: string }> {
    const p = sanitizePrompt(buildCommandPrompt(agentNames, utterance, now));
    // X-260 — through the seam.
    return execOneShot({ cwd, args: judgeArgs, prompt: p, timeoutMs: 180_000 }).then(r => {
        const raw = r.out;
        if (r.error && !raw) {
            return { errors: ['planner unavailable: ' + r.error.slice(0, 100)], raw: '' };
        }
        const { plan, error } = parsePlan(raw);
        if (!plan) { return { errors: [error ?? 'unparseable plan'], raw }; }
        const errors = validatePlan(plan, agentNames);
        return { plan: errors.length ? undefined : plan, errors, raw };
    });
}
