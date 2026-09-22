import * as path from 'path';
import { AgentInfo } from './agents';
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { FarmSchedule, FarmTrigger, FarmWorkflow, WorkflowStep } from './tasks';

/**
 * The three working examples "Set Up an Example" creates — each an ordinary
 * definition the user can edit or remove afterwards. The palette walk-through
 * and `examples.setup` build them here, so an example an agent seeds is the
 * example a person would have got.
 *
 * The prompts are Turkish on purpose: they are instructions to the user's own
 * Turkish-speaking agents, not UI.
 */

export type ExampleKind = 'inbox' | 'morning' | 'chain';
export const EXAMPLE_KINDS: readonly ExampleKind[] = ['inbox', 'morning', 'chain'];

type Who = Pick<AgentInfo, 'id' | 'name'>;

/** A new file in the watched folder fires a headless task that inspects and files it (guide S1). */
export function inboxExample(agent: Who, folder: string): Omit<FarmTrigger, 'id'> {
    return {
        title: `Inbox: ${path.basename(folder)}`,
        type: 'watch',
        watchPath: folder,
        action: {
            kind: 'task', agentId: agent.id, agentName: agent.name,
            title: 'Inbox triage',
            prompt: 'İzlenen klasöre ({watch}) yeni veya değişmiş bir dosya düştü. Dosyayı bul, içeriğine bak ve: '
                + '(1) ne olduğunu tek satırda özetle; (2) CLAUDE.md/hafızandaki kurallara göre uygun yere taşı ya da işle; '
                + '(3) ne yaptığını kısaca raporla. Emin olamadığın dosyaya dokunma, sadece raporla.',
            mode: 'headless'
        },
        debounceSec: 20, cooldownSec: 60, maxPerHour: 6, enabled: true
    };
}

/** Every day at 09:00 the agent reviews its memory and duties and writes a short plan (guide S3). */
export function morningExample(agent: Who): Omit<FarmSchedule, 'id'> {
    return {
        agentId: agent.id, agentName: agent.name,
        title: 'Morning briefing',
        prompt: 'Günaydın. Hafızanı, DUTIES.md görevlerini ve dünkü durumu gözden geçir; '
            + 'bugün için 3-5 maddelik kısa bir plan/brifing yaz. Yeni dosya oluşturma, sadece raporla.',
        mode: 'headless', kind: 'daily', hour: 9, minute: 0, enabled: true
    };
}

/** Agent A analyzes, agent B turns it into an executive summary through {prev_text} (guide S4). */
export function chainExample(a: Who, b: Who): { title: string; steps: WorkflowStep[] } {
    return {
        title: 'Analyze → Summarize',
        steps: [
            {
                agentId: a.id, agentName: a.name, title: 'Analyze',
                prompt: 'Ajan klasöründeki güncel duruma (hafıza, son raporlar, DUTIES.md) bakarak bugünün en önemli 3 konusunu analiz et. '
                    + 'Her biri için durum + risk + öneri yaz.',
                mode: 'headless'
            },
            {
                agentId: b.id, agentName: b.name, title: 'Summarize',
                prompt: 'Aşağıdaki analizi 5 cümleyi geçmeyen bir yönetici özetine çevir:\n\n{prev_text}',
                mode: 'headless'
            }
        ]
    };
}

export interface ExampleOpsDeps {
    agents(): AgentInfo[];
    addTrigger(t: Omit<FarmTrigger, 'id'>): FarmTrigger;
    addSchedule(s: Omit<FarmSchedule, 'id'>): FarmSchedule;
    addWorkflow(title: string, steps: WorkflowStep[]): FarmWorkflow;
    runWorkflow(w: FarmWorkflow): string | undefined;
}

export function registerExampleOps(bridge: BridgeRegistry, deps: ExampleOpsDeps): void {
    const agentBy = (key: string, arg: string): AgentInfo => {
        const want = key.trim().toLowerCase();
        const found = deps.agents().find(a => a.id.toLowerCase() === want || a.name.toLowerCase() === want);
        need(found, `no agent "${key}" for ${arg} — agents.list shows them`);
        return found as AgentInfo;
    };
    bridge.register([
        {
            op: 'examples.setup',
            describe: 'Create one of the three working examples "Set Up an Example" offers, as an ordinary definition that can be edited or removed afterwards. ‼️ The inbox trigger and the morning schedule are created ENABLED, as the palette creates them — from then on they start headless tasks by themselves, which costs; the chain only runs when you pass run:true. args: example ("inbox" = a watch trigger on `folder` whose task triages each new file · "morning" = a daily 09:00 briefing schedule · "chain" = a two-step workflow, `agent` analyzes and `agentB` summarizes), agent (id or name), folder? (inbox: the folder to watch), agentB? (chain), run? (chain: start it now)',
            handler: (args) => {
                const example = argStr(args, 'example') as ExampleKind;
                need(EXAMPLE_KINDS.includes(example), `example is inbox, morning or chain — not "${example}"`);
                const agent = agentBy(argStr(args, 'agent'), 'agent');
                if (example === 'inbox') {
                    const folder = optStr(args, 'folder').trim();
                    need(folder, 'the inbox example watches a folder — pass `folder`');
                    const t = deps.addTrigger(inboxExample(agent, folder));
                    return { example, kind: 'trigger', id: t.id, title: t.title, agent: agent.name, watchPath: folder, enabled: true };
                }
                if (example === 'morning') {
                    const s = deps.addSchedule(morningExample(agent));
                    return { example, kind: 'schedule', id: s.id, title: s.title, agent: agent.name, at: '09:00 daily', enabled: true };
                }
                const second = optStr(args, 'agentB');
                need(second, 'the chain needs a second agent to summarize — pass `agentB`');
                const b = agentBy(second, 'agentB');
                const c = chainExample(agent, b);
                const w = deps.addWorkflow(c.title, c.steps);
                const run = args.run === true;
                return {
                    example, kind: 'workflow', id: w.id, title: w.title, agents: [agent.name, b.name],
                    ...(run ? { started: deps.runWorkflow(w) ?? null } : { note: 'created, not run — workflows.run starts it' })
                };
            }
        }
    ]);
}
