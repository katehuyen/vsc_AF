/**
 * X-536 — THE AGENT MANUAL ON THE BRIDGE.
 *
 * `farm.guide` · `farm.find` · `farm.ops` read the compiled manual (af.js
 * answers the same three locally; these registrations serve raw request files,
 * MCP and in-process callers with the identical text). `farm.brief` composes
 * the caller's live situation. `manual.*` stages, installs and audits it.
 *
 * `farm.ops` REPLACES the registry's built-in one on purpose: its old answer —
 * every op with its whole contract — measured 458 KB, about a hundred and
 * twenty thousand tokens, and every agent was told to call it first. That
 * dump is still one argument away (`full=true`) for tools that want it.
 */

import { BridgeRefusal, BridgeRegistry, optBool, optNum, optStr } from './bridge';
import { answerManualOp, CompiledManual, findInManual, isMarkdownAnswer, renderFind } from '../service/manualQuery';
import { BriefDeps, composeBrief } from './manualBrief';
import { appendGap, clearGaps, readGaps, summarizeGaps } from './manualGaps';
import { applyInstall, planInstall, removeSkills, skillStatus, skillTargets, skillText } from './manualInstall';
import { StageResult } from './manualStage';
import { StartCardMode } from './startCard';

/** Reads of the manual that must not raise the per-request notification. */
export const QUIET_MANUAL_OPS: ReadonlySet<string> = new Set([
    'farm.guide', 'farm.find', 'farm.ops', 'farm.brief', 'manual.status', 'manual.gaps'
]);

export interface ManualOpsDeps {
    manual: () => CompiledManual;
    /** problems of the last compile (derived metadata, dead references...) */
    problems: () => string[];
    stage: () => StageResult | undefined;
    startCardMode: () => StartCardMode;
    bridgeDir: string;
    home: () => string;
    env?: Record<string, string | undefined>;
    brief: BriefDeps;
}

function list(v: unknown): string[] {
    if (Array.isArray(v)) { return v.map(String).map(s => s.trim()).filter(Boolean); }
    return String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

export function registerManualOps(bridge: BridgeRegistry, deps: ManualOpsDeps): void {
    const answer = (op: string, args: Record<string, unknown>, session?: string): unknown => {
        const m = deps.manual();
        const r = answerManualOp(m, op, args);
        if (!r) { throw new Error(`${op} is not a manual op`); }
        if (!r.ok) {
            appendGap(deps.bridgeDir, { ts: Date.now(), kind: op === 'farm.guide' ? 'no-guide' : 'unknown-op',
                what: optStr(args, 'id') || optStr(args, 'op') || optStr(args, 'area'), ...(session ? { session } : {}) });
            throw new BridgeRefusal(r.error);
        }
        const q = optStr(args, 'q');
        if (q && (op === 'farm.find' || op === 'farm.guide')) {
            const f = findInManual(m, q, { limit: 3 });
            if (f.weak) {
                appendGap(deps.bridgeDir, { ts: Date.now(), kind: 'weak-find', what: q,
                    near: f.hits.map(h => h.id), ...(session ? { session } : {}) });
            }
        }
        return r.result;
    };

    bridge.register([
        {
            op: 'farm.guide',
            describe: 'The Agent Manual. No args: the map (how to work any request, every area and playbook, '
                + 'the effects legend). id=<area | playbook | op>: that area guide, playbook or op contract. '
                + 'q=<words>: the same as farm.find. af.js answers it locally, so it also works while VS Code '
                + 'is closed. args: id?, q?, format? (markdown, the default, or json)',
            handler: (args, from) => answer('farm.guide', args, from?.sessionId)
        },
        {
            op: 'farm.find',
            describe: 'Rank the playbooks, area guides and ops that match a request in plain English, best '
                + 'first, each with the call that opens it. Start here when you do not know which op or '
                + 'mechanism fits. args: q (what the user wants done), limit? (default 8), kind? (playbook | '
                + 'area | op, comma-separated), format? (markdown | json)',
            handler: (args, from) => answer('farm.find', args, from?.sessionId)
        },
    ]);
    // The registry's built-in farm.ops is replaced deliberately, and only it.
    bridge.register({
            op: 'farm.ops',
            describe: 'The bridge catalog. No args: every op name grouped by area (compact). op=<name>: one '
                + 'op\'s full contract with its effect, area, nearby ops and the playbooks that use it. '
                + 'area=<id>: that area\'s ops with one-line summaries. q=<words>: ops matching the words. '
                + 'full=true: every op with its whole contract as [{op, describe}] (large: write it to a file '
                + 'with --out, never into your context). args: op?, area?, q?, full?, format? (markdown | json)',
            handler: (args, from) => answer('farm.ops', args, from?.sessionId)
    }, { replace: true });
    bridge.register([
        {
            op: 'farm.brief',
            describe: 'Your situation in one call: which session, agent, engine, account and project you '
                + 'are; what waits for you (questions the user answered, work queue items, A2A notes and '
                + 'tasks); what the fleet is doing and what needs the user; which engines can run; whether '
                + 'automations are live; the language the user reads. args: agent? (your agent name, when '
                + 'your session cannot be identified), format? (markdown | json)',
            handler: async (args, from) => {
                const b = await composeBrief(deps.brief, args, from);
                return optStr(args, 'format') === 'json' ? b.data : { format: 'markdown', text: b.text + '\n' };
            }
        },
        {
            op: 'manual.status',
            describe: 'Where the Agent Manual is staged (manual.json, the ~/.agentfarm launcher, the command '
                + 'agents should type), how many ops and guides it covers, any op it had to describe '
                + 'automatically or reference it found broken, the start-card mode, and which engines have the '
                + 'agent-farm skill. args: none',
            handler: () => {
                const m = deps.manual();
                const st = deps.stage();
                return {
                    version: m.version,
                    builtAt: m.builtAt,
                    ops: m.ops.length,
                    derivedOps: m.ops.filter(o => o.derived).map(o => o.op),
                    areas: m.docs.filter(d => d.kind === 'area').length,
                    playbooks: m.docs.filter(d => d.kind === 'playbook').length,
                    problems: deps.problems(),
                    staged: st ? { manual: st.manualPath, launcher: st.launcherPath ?? null, command: st.command, problems: st.problems } : null,
                    startCard: deps.startCardMode(),
                    skills: skillStatus(skillTargets(deps.home(), deps.env), skillText(m))
                };
            }
        },
        {
            op: 'manual.install',
            describe: 'Install the agent-farm skill so sessions Agent Farm does not start (a terminal the user '
                + 'opens) learn how to drive it. Plans first: without confirm=true it only lists what it would '
                + 'write. Default targets are the measured ones: Claude Code (OpenCode reads the same folder) '
                + 'and Codex; name engines=gemini or engines=agy to include the unmeasured ones. A skill of the '
                + 'same name that Agent Farm did not write is never touched. Installed skills are refreshed on '
                + 'every start. args: engines? (list or comma-separated), confirm? (true writes)',
            handler: (args) => {
                const text = skillText(deps.manual());
                const rows = planInstall(skillTargets(deps.home(), deps.env), text, list(args.engines));
                if (!optBool(args, 'confirm')) { return { planned: true, rows, note: 'Nothing written. Pass confirm=true to install.' }; }
                return { planned: false, rows, written: applyInstall(rows, text) };
            }
        },
        {
            op: 'manual.remove',
            describe: 'Remove the agent-farm skill files Agent Farm installed; a file it did not write is '
                + 'reported and kept. args: engines? (list or comma-separated; omitted = every target)',
            handler: (args) => removeSkills(skillTargets(deps.home(), deps.env), list(args.engines))
        },
        {
            op: 'manual.gaps',
            describe: 'Where the manual failed agents: ops they called that do not exist, searches with no '
                + 'confident answer, guides that were not there, counted and newest first. Read it to improve '
                + 'the manual. args: limit? (default 100), clear? (true empties the log)',
            handler: (args) => {
                if (optBool(args, 'clear')) { return { cleared: clearGaps(deps.bridgeDir) }; }
                const gaps = readGaps(deps.bridgeDir, optNum(args, 'limit', 100));
                return { total: gaps.length, summary: summarizeGaps(gaps), recent: gaps.slice(0, 20) };
            }
        }
    ]);
}

/** For processBridge: is this answer text an agent should read as-is? Re-exported for one import site. */
export { isMarkdownAnswer, renderFind };
