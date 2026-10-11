/**
 * X-443 — WHAT A PHONE DOES WITH A HOST COMMAND OF THE RIGHT-CLICK CATALOGUE.
 *
 * On the PC a row's menu is VS Code's: the row's `data-vscode-context` goes to
 * the command, and the handler asks whatever it needs with `vscode.window`. A
 * phone's long press draws the same catalogue in a sheet (media/afMobile.js),
 * and a host command picked there cannot simply be executed: a handler that
 * asks on the PC opens a dialog nobody is looking at (the X-447 defect).
 *
 * So every host command of the catalogue has ONE verdict here, and nothing else
 * decides it — the sheet, the farm's relay and `ui.ctxmenu` all read this table:
 *
 *   page  the phone opens one of its OWN pages, named from what the row knows
 *   copy  what the row knows goes on the PHONE's clipboard
 *   run   the SAME command runs on the farm with the row's context and the
 *         view's `ask`, so its questions and its messages are the phone's.
 *         Only a handler that speaks through `arg.ask` may have it
 *         (test/test_ctx_phone.js reads the handler's own source)
 *   pc    it stays on the PC, and `why` says so; `gap` marks one a phone should
 *         get once its handler asks through `ask` — CTX_PHONE_GAPS only shrinks
 *
 * PURE — no vscode import; the test requires the compiled file directly.
 */
import { CTX_ITEMS, ctxDrawsOn } from './ctxmenu';

export type CtxPhoneVerdict =
    /** `args`: the page's argument → the row-context key that fills it. */
    | { on: 'page'; to: string; args: Readonly<Record<string, string>> }
    | { on: 'copy'; key: string }
    | { on: 'run'; scope: 'answer' | 'manage' | 'admin' }
    | { on: 'pc'; why: string; gap?: true };

const RUN: CtxPhoneVerdict = { on: 'run', scope: 'manage' };
const pc = (why: string): CtxPhoneVerdict => ({ on: 'pc', why });
/** Wanted on a phone; its handler still asks or answers with vscode.window. */
const gap = (why: string): CtxPhoneVerdict => ({ on: 'pc', why, gap: true });

const PC_PANEL = 'it opens a panel the phone has no page for';
const PC_FILES = 'it opens the PC\'s own file manager or window';
const PC_SOUND = 'it is the PC\'s own voice and sound; the phone reads with its own';
const PC_START = 'it opens a launcher or a terminal on the PC; the phone starts a session from the agent\'s page or the Console';
const CHAIN = 'its row is judged against the chain list the PC holds; the row\'s own chain mark opens the chain on the phone';

export const CTX_PHONE: Readonly<Record<string, CtxPhoneVerdict>> = {
    // ---- the phone's own pages
    'agentfarm.openAgentDetail': { on: 'page', to: 'agent', args: { agentId: 'agentId' } },
    'agentfarm.openSession': { on: 'page', to: 'session', args: { sessionId: 'sessionId', file: 'file' } },
    'agentfarm.sessionToQueue': { on: 'page', to: 'queue', args: { session: 'sessionId' } },
    // ---- the phone's own clipboard
    'agentfarm.copySessionId': { on: 'copy', key: 'sessionId' },
    'agentfarm.copySessionPath': { on: 'copy', key: 'file' },
    'agentfarm.copySessionCwd': { on: 'copy', key: 'cwd' },
    'agentfarm.copyAgentName': { on: 'copy', key: 'agentName' },
    'agentfarm.copyAgentFolder': { on: 'copy', key: 'agentDir' },
    // ---- the same command, asked on the phone
    'agentfarm.renameSession': RUN,
    'agentfarm.pinSession': RUN,
    'agentfarm.resumeInConsole': RUN,
    'agentfarm.consoleResumeSession': RUN,
    'agentfarm.consoleInterruptTurn': RUN,
    'agentfarm.consoleEndSession': RUN,
    'agentfarm.consoleEndAndRemove': RUN,
    'agentfarm.consoleForgetSession': RUN,
    'agentfarm.tagSession': RUN,
    'agentfarm.endSession': RUN,
    'agentfarm.forceKillSession': RUN,
    'agentfarm.interruptSession': RUN,
    'agentfarm.dismissSession': RUN,
    'agentfarm.assignSessionProject': RUN,
    'agentfarm.assignProject': RUN,
    'agentfarm.addSessionFolderToProject': RUN,
    'agentfarm.sessionToWiki': RUN,
    'agentfarm.planUsageRefresh': RUN,
    'agentfarm.insightHistory': RUN,
    'agentfarm.restoreInsights': RUN,
    'agentfarm.syncAntigravity': RUN,
    // ---- wanted on a phone, waiting for a handler that asks through `ask`
    'agentfarm.copyCorpus': gap('its text is built on the farm and written to the PC\'s clipboard'),
    'agentfarm.openSessionAgent': gap('the row names the agent, not its id; the handler opens the PC\'s agent page'),
    'agentfarm.consoleForAgent': gap('it opens the PC\'s Console with the agent chosen'),
    // ---- the PC's own
    'agentfarm.copyChainId': pc(CHAIN),
    'agentfarm.showChain': pc(CHAIN),
    'agentfarm.openAgentInNewWindow': pc(PC_FILES),
    'agentfarm.revealAgent': pc(PC_FILES),
    'agentfarm.revealSessionFolder': pc(PC_FILES),
    'agentfarm.focusSessionTerminal': pc('it brings a terminal of the PC forward'),
    'agentfarm.exportAgentPack': pc('it saves a file through the PC\'s save dialog'),
    'agentfarm.resumeSession': pc(PC_START),
    'agentfarm.continueSession': pc(PC_START),
    'agentfarm.launchSession': pc(PC_START),
    'agentfarm.readLastAnswer': pc(PC_SOUND),
    'agentfarm.readSelection': pc(PC_SOUND),
    'agentfarm.setSessionAlertVoice': pc(PC_SOUND),
    'agentfarm.lapReset': pc('the lap is the PC status bar\'s own counter'),
    'agentfarm.lapClear': pc('the lap is the PC status bar\'s own counter'),
    'agentfarm.openDuties': pc('it opens the file in the PC\'s editor; the agent\'s page on the phone shows its duties'),
    'agentfarm.addDuty': pc(PC_PANEL),
    'agentfarm.addMemory': pc(PC_PANEL),
    'agentfarm.distillMemory': pc(PC_PANEL),
    'agentfarm.openMemoryGraph': pc(PC_PANEL),
    'agentfarm.configureLivingChecks': pc(PC_PANEL),
    'agentfarm.openTaskHistory': pc(PC_PANEL),
    'agentfarm.projectFromSession': pc(PC_PANEL)
};

/** How many commands a phone should get and does not yet. It only shrinks: a new gap is a new debt. */
export const CTX_PHONE_GAPS = 3;

export function ctxPhoneVerdict(command: string): CtxPhoneVerdict | undefined {
    return Object.prototype.hasOwnProperty.call(CTX_PHONE, command) ? CTX_PHONE[command] : undefined;
}

export interface CtxPhoneItem {
    title: string; command: string; when: string; group: string; menu?: string;
    /** What the phone does with a pick; a `run` is all it needs to know of one. */
    phone: { on: 'page'; to: string; args: Readonly<Record<string, string>> } | { on: 'copy'; key: string } | { on: 'run' };
}

/**
 * The host commands a phone's row menu offers, each with its when clause for
 * the page to judge against the row (as ctxPageActions' items are). A command
 * that stays on the PC is not in the list at all.
 */
export function ctxPhoneItems(titleOf: (command: string) => string): CtxPhoneItem[] {
    const out: CtxPhoneItem[] = [];
    for (const item of CTX_ITEMS) {
        const v = item.command ? ctxPhoneVerdict(item.command) : undefined;
        if (!item.command || !v || v.on === 'pc') { continue; }
        out.push({
            title: titleOf(item.command) || item.command.replace(/^agentfarm\./, ''),
            command: item.command, when: item.when, group: item.group,
            ...(item.menu ? { menu: item.menu } : {}),
            phone: v.on === 'run' ? { on: 'run' } : v
        });
    }
    return out;
}

export type CtxPhoneRun =
    | { ok: true; command: string; scope: string; arg: Record<string, unknown> }
    | { ok: false; why: string };

/**
 * The farm's judgement of a command a phone asked it to run for a row: it is a
 * `run` command, it IS on that kind of row's menu, and the context is reduced
 * to what a row can publish — plain values and lists of them. Whatever else the
 * phone put there (an `ask` of its own, an object) never reaches the handler.
 */
export function ctxPhoneRun(command: unknown, ctx: unknown): CtxPhoneRun {
    const name = typeof command === 'string' ? command : '';
    const v = ctxPhoneVerdict(name);
    if (!v) { return { ok: false, why: 'That is not a command of this menu.' }; }
    if (v.on === 'pc') { return { ok: false, why: 'Not available on the phone — ' + v.why + '.' }; }
    if (v.on !== 'run') { return { ok: false, why: 'The phone answers that one itself.' }; }
    const arg = plainCtx(ctx);
    const section = typeof arg.webviewSection === 'string' ? arg.webviewSection : '';
    if (!CTX_ITEMS.some(i => i.command === name && ctxDrawsOn(i.when, section))) {
        return { ok: false, why: 'That command is not on this row\'s menu.' };
    }
    return { ok: true, command: name, scope: v.scope, arg };
}

function plain(v: unknown): v is string | number | boolean {
    return typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
}

function plainCtx(ctx: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) { return out; }
    for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
        if (k === 'ask') { continue; }
        if (plain(v)) { out[k] = v; } else if (Array.isArray(v)) { out[k] = v.filter(plain); }
    }
    return out;
}

/** What `ui.ctxmenu` says of one item: where a pick is answered for a phone, and why when it is the PC. */
export function ctxPhoneNote(command: string): { phone: string; phoneWhy?: string } {
    const v = ctxPhoneVerdict(command);
    if (!v) { return { phone: 'page action' }; }
    return v.on === 'pc' ? { phone: v.gap ? 'pc (gap)' : 'pc', phoneWhy: v.why } : { phone: v.on };
}

/** What is wrong with the table — read by the test, so a command with no verdict fails the build. */
export function ctxPhoneProblems(): string[] {
    const problems: string[] = [];
    const catalogue = new Set(CTX_ITEMS.map(i => i.command).filter((c): c is string => !!c));
    for (const c of catalogue) {
        if (!ctxPhoneVerdict(c)) { problems.push(`${c}: no phone verdict — say page, copy, run or pc in src/core/ctxPhone.ts`); }
    }
    let gaps = 0;
    for (const [c, v] of Object.entries(CTX_PHONE)) {
        if (!catalogue.has(c)) { problems.push(`${c}: a phone verdict for a command the catalogue does not have`); }
        if (v.on === 'pc') {
            if (!v.why.trim()) { problems.push(`${c}: a command that stays on the PC says why`); }
            if (v.gap) { gaps++; }
        }
        if (v.on === 'copy' && !v.key) { problems.push(`${c}: a copy names the row key it copies`); }
        if (v.on === 'page' && (!v.to || !Object.keys(v.args).length)) { problems.push(`${c}: a page names itself and what of the row fills it`); }
    }
    if (gaps !== CTX_PHONE_GAPS) {
        problems.push(`${gaps} commands wait for a phone answer and CTX_PHONE_GAPS says ${CTX_PHONE_GAPS} — `
            + (gaps > CTX_PHONE_GAPS ? 'a new gap is not allowed: give the command a phone answer' : 'lower CTX_PHONE_GAPS to match'));
    }
    return problems;
}
