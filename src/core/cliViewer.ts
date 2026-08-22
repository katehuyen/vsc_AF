import * as path from 'path';
import {
    agyAnnouncedCall, agyArg, agyIsToolStep, AgyStep, agyStepFailed, AgyToolCall,
    agyToolDetail, agyToolName,
    codexCompletedMessage, codexPromptTitle, codexUserText, geminiUserOpening, readFarmConsoleTranscript
} from './cliTranscripts';
import { opencodeExport, opencodeTitle } from './opencodehistory';
import { addUsage, emptyUsage, PricingEngine, totalTokens, Usage, weightedTokens } from './pricing';
import { conversationTitle } from './sessions';
import { StepKind, stepKindForTool } from './stepkind';

export interface CliViewMessage {
    role: 'user' | 'assistant' | 'tool' | 'toolResult' | 'system';
    ts: number;
    text?: string;
    tool?: string;
    input?: string;
    isError?: boolean;
    model?: string;
    tokens?: number;
    wTokens?: number;
    cost?: number;
    kind?: StepKind;
    turn?: number;
    turnStart?: boolean;
}

export interface CliViewTurn {
    n: number; label: string; prompt: string; ts: number;
    tokens: number; wTokens: number; cost: number;
    apiCalls: number; steps: number; thinking: number; ms: number; endCtx: number;
    tools: number; errors: number; topTools: { name: string; n: number }[];
    models: string[]; attrs: Record<string, string>;
}

export interface ParsedCliViewer {
    engine: 'codex' | 'gemini' | 'agy' | 'opencode';
    sessionId: string;
    title: string;
    cwd: string;
    permissionMode: string;
    firstTs: number;
    lastTs: number;
    models: string[];
    usage: Usage;
    totalTokens: number;
    totalWTokens: number;
    cost: number;
    errors: number;
    toolCalls: number;
    context: { tokens: number; ts: number; model: string; limit?: number };
    turnCount: number;
    turnTotals: Record<number, TurnAcc>;
    turns: CliViewTurn[];
    messages: CliViewMessage[];
}

interface TurnAcc {
    tokens: number; wTokens: number; cost: number; apiCalls: number; steps: number;
    thinking: number; endTs: number; endCtx: number;
}

const TOOL_LIMIT = 200_000;
const TURN_PROMPT_MAX = 8000;

const clipTool = (s: string): string => s.length > TOOL_LIMIT
    ? s.slice(0, TOOL_LIMIT) + `\n… [tool payload cut here — ${s.length.toLocaleString()} characters total; "Open raw JSONL" has all of it]`
    : s;

const asText = (value: unknown): string => {
    if (typeof value === 'string') { return value; }
    if (Array.isArray(value)) {
        return value.map(v => {
            if (typeof v === 'string') { return v; }
            if (!v || typeof v !== 'object') { return ''; }
            const o = v as Record<string, unknown>;
            return typeof o.text === 'string' ? o.text
                : typeof o.content === 'string' ? o.content : '';
        }).filter(Boolean).join('\n');
    }
    if (value && typeof value === 'object') {
        try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    }
    return value === undefined || value === null ? '' : String(value);
};

const stamp = (v: unknown): number => {
    if (typeof v === 'number' && Number.isFinite(v)) { return v; }
    if (typeof v !== 'string') { return 0; }
    const n = Date.parse(v.replace(/(\.\d{3})\d+/, '$1'));
    return Number.isFinite(n) ? n : 0;
};

const promptLabel = (text: string): string => {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length > 90 ? t.slice(0, 89) + '…' : t;
};

const blankTurn = (): TurnAcc => ({
    tokens: 0, wTokens: 0, cost: 0, apiCalls: 0, steps: 0,
    thinking: 0, endTs: 0, endCtx: 0
});

function parseFarmConsole(raw: string): ParsedCliViewer | undefined {
    const snap = readFarmConsoleTranscript(raw);
    if (!snap) { return undefined; }
    const messages: CliViewMessage[] = [];
    const turns: Record<number, TurnAcc> = {};
    const prompts: Record<number, string> = {};
    const started: Record<number, number> = {};
    const models: Record<number, Set<string>> = {};
    const attrs: Record<number, Record<string, string>> = {};
    let turn = 0;
    for (const m of snap.messages) {
        if (m.role === 'user') {
            if (!m.steer || !turn) {
                turn++;
                prompts[turn] = m.text ?? '';
                started[turn] = m.ts;
                turns[turn] = blankTurn();
                if (snap.model) { models[turn] = new Set([snap.model]); }
                if (snap.effort) { attrs[turn] = { effort: snap.effort }; }
            }
            messages.push({ role: 'user', ts: m.ts, text: m.text, turn, turnStart: !m.steer });
            continue;
        }
        if (m.role === 'agent') {
            messages.push({ role: 'assistant', ts: m.ts, text: m.text, model: snap.model || undefined, kind: m.kind, turn: turn || undefined });
            if (turn) { turns[turn].steps++; }
            continue;
        }
        if (m.role === 'tool' && m.tool) {
            messages.push({ role: 'tool', ts: m.ts, tool: m.tool.name, input: m.tool.detail, kind: m.kind, turn: turn || undefined });
            if (turn) { turns[turn].steps++; }
            continue;
        }
        if (m.role === 'tool') {
            messages.push({ role: 'toolResult', ts: m.ts, text: m.text, isError: m.isError, turn: turn || undefined });
            continue;
        }
        if (m.role === 'result') {
            if (turn) {
                turns[turn].tokens += m.tokens ?? 0;
                turns[turn].cost += m.cost ?? 0;
                turns[turn].endTs = m.ts;
            }
            if (m.isError && m.text) {
                messages.push({ role: 'system', ts: m.ts, text: m.text, isError: true, turn: turn || undefined });
            }
            continue;
        }
        if (m.text) {
            messages.push({
                role: 'system', ts: m.ts, text: m.text,
                isError: m.isError || m.role === 'error', turn: turn || undefined
            });
        }
    }
    if (turn && snap.contextTokens) { turns[turn].endCtx = snap.contextTokens; }
    const table = finishTurns(messages, turns, prompts, started, models, attrs);
    const firstUser = snap.messages.find(m => m.role === 'user' && m.text?.trim());
    return {
        engine: 'agy', sessionId: snap.sessionId,
        title: firstUser?.text ? conversationTitle(firstUser.text) : 'Antigravity session',
        cwd: snap.cwd, permissionMode: snap.permissionMode,
        firstTs: snap.startedAt, lastTs: snap.lastTs,
        models: snap.model ? [snap.model] : [], usage: emptyUsage(),
        totalTokens: snap.tokens, totalWTokens: snap.wTokens, cost: snap.cost,
        errors: messages.filter(m => m.isError).length,
        toolCalls: messages.filter(m => m.role === 'tool').length,
        context: { tokens: snap.contextTokens, ts: snap.lastTs, model: snap.model },
        turnCount: table.length, turnTotals: turns, turns: table, messages
    };
}

function usageDiff(next: Usage, prev: Usage): Usage {
    return {
        input: Math.max(0, next.input - prev.input),
        output: Math.max(0, next.output - prev.output),
        cacheWrite: Math.max(0, next.cacheWrite - prev.cacheWrite),
        cacheRead: Math.max(0, next.cacheRead - prev.cacheRead),
        ...(('cacheWrite1h' in next || 'cacheWrite1h' in prev)
            ? { cacheWrite1h: Math.max(0, (next.cacheWrite1h ?? 0) - (prev.cacheWrite1h ?? 0)) } : {})
    };
}

/**
 * ‼️ `reasoning_output_tokens` IS ALREADY INSIDE `output_tokens` — the second
 * place this file's twin got it wrong (X-35).
 *
 * Measured twice on this machine's own rollouts, and the file states the
 * identity itself: `total_tokens` is `input + output`.
 *
 *   input 20 766 + output   822 = total  21 588   (reasoning   211)
 *   input 32 705 304 + output 95 054 = total 32 800 358  (reasoning 31 839)
 *
 * Adding the two charged the model's private thinking twice, so every Codex
 * TURN in the session viewer over-reported its output — and the per-turn cost
 * and weighted tokens derived from it — by the size of that thinking. The
 * cumulative-total handling around this function was already right (it takes a
 * delta against the previous block); this one line was not.
 */
function codexUsage(value: unknown): Usage {
    const o = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const n = (k: string): number => typeof o[k] === 'number' && Number.isFinite(o[k])
        ? Math.max(0, Math.trunc(o[k] as number)) : 0;
    const input = n('input_tokens');
    const cached = Math.min(n('cached_input_tokens'), input);
    return {
        input: Math.max(0, input - cached),
        output: n('output_tokens'),
        cacheWrite: n('cache_write_input_tokens'),
        cacheRead: cached
    };
}

function finishTurns(
    messages: CliViewMessage[], turns: Record<number, TurnAcc>,
    prompts: Record<number, string>, started: Record<number, number>,
    models: Record<number, Set<string>>, attrs: Record<number, Record<string, string>>
): CliViewTurn[] {
    const tools: Record<number, Record<string, number>> = {};
    const errors: Record<number, number> = {};
    for (const m of messages) {
        if (!m.turn) { continue; }
        if (m.role === 'tool') {
            const bag = tools[m.turn] ?? (tools[m.turn] = {});
            const name = m.tool || '?';
            bag[name] = (bag[name] ?? 0) + 1;
        }
        if (m.role === 'toolResult' && m.isError) {
            errors[m.turn] = (errors[m.turn] ?? 0) + 1;
        }
    }
    return Object.keys(prompts).map(Number).sort((a, b) => a - b).map(n => {
        const acc = turns[n] ?? blankTurn();
        const ts = started[n] ?? 0;
        return {
            n, label: promptLabel(prompts[n] ?? ''),
            prompt: String(prompts[n] ?? '').trim().slice(0, TURN_PROMPT_MAX), ts,
            tokens: acc.tokens, wTokens: Math.round(acc.wTokens), cost: acc.cost,
            apiCalls: acc.apiCalls, steps: acc.steps, thinking: acc.thinking,
            ms: ts && acc.endTs > ts ? acc.endTs - ts : 0, endCtx: acc.endCtx,
            tools: Object.values(tools[n] ?? {}).reduce((a, b) => a + b, 0),
            errors: errors[n] ?? 0,
            topTools: Object.entries(tools[n] ?? {}).sort((a, b) => b[1] - a[1])
                .slice(0, 4).map(([name, count]) => ({ name, n: count })),
            models: [...(models[n] ?? [])], attrs: attrs[n] ?? {}
        };
    });
}

function parseCodex(raw: string, file: string, pricing: PricingEngine): ParsedCliViewer | undefined {
    const messages: CliViewMessage[] = [];
    const usage = emptyUsage();
    const models = new Set<string>();
    const turns: Record<number, TurnAcc> = {};
    const prompts: Record<number, string> = {};
    const started: Record<number, number> = {};
    const turnModels: Record<number, Set<string>> = {};
    const turnAttrs: Record<number, Record<string, string>> = {};
    const calls = new Map<string, string>();
    const assistantSeen = new Set<string>();
    let saw = false, sessionId = path.basename(file, '.jsonl'), cwd = '', title = '';
    let firstTs = 0, lastTs = 0, turn = 0, currentModel = '', currentEffort = '';
    let previous = emptyUsage(), cost = 0, wTokens = 0, toolCalls = 0, errors = 0;
    let ctxTokens = 0, ctxTs = 0, ctxLimit = 0;

    const touch = (ts: number) => {
        if (!ts) { return; }
        if (!firstTs) { firstTs = ts; }
        lastTs = Math.max(lastTs, ts);
        if (turn) { (turns[turn] ?? (turns[turn] = blankTurn())).endTs = lastTs; }
    };
    const addAssistant = (text: string, ts: number) => {
        const clean = text.trim();
        if (!clean || assistantSeen.has(`${turn}:${clean}`)) { return; }
        assistantSeen.add(`${turn}:${clean}`);
        messages.push({ role: 'assistant', ts, text: clean, model: currentModel || undefined, kind: 'say', turn: turn || undefined });
        if (turn) { (turns[turn] ?? (turns[turn] = blankTurn())).steps++; }
    };
    const addTool = (name: string, input: unknown, callId: string, ts: number) => {
        toolCalls++;
        if (callId) { calls.set(callId, name); }
        messages.push({ role: 'tool', ts, tool: name, input: clipTool(asText(input)), kind: stepKindForTool(name), turn: turn || undefined });
        if (turn) { (turns[turn] ?? (turns[turn] = blankTurn())).steps++; }
    };

    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: Record<string, unknown>;
        try { line = JSON.parse(lineText) as Record<string, unknown>; } catch { continue; }
        const type = typeof line.type === 'string' ? line.type : '';
        const p = line.payload && typeof line.payload === 'object'
            ? line.payload as Record<string, unknown> : undefined;
        if (!p) { continue; }
        const ts = stamp(line.timestamp);
        touch(ts);
        if (type === 'session_meta') {
            saw = true;
            const sid = p.session_id ?? p.id;
            if (typeof sid === 'string' && sid) { sessionId = sid; }
            if (typeof p.cwd === 'string') { cwd = p.cwd; }
            continue;
        }
        if (!saw) { continue; }
        if (type === 'turn_context') {
            if (typeof p.model === 'string' && p.model) { currentModel = p.model; models.add(currentModel); }
            if (typeof p.effort === 'string') { currentEffort = p.effort; }
            if (turn && currentModel) { (turnModels[turn] ?? (turnModels[turn] = new Set())).add(currentModel); }
            if (turn && currentEffort) { (turnAttrs[turn] ?? (turnAttrs[turn] = {})).effort = currentEffort; }
            continue;
        }
        const sub = typeof p.type === 'string' ? p.type : '';
        const completed = type === 'event_msg' ? codexCompletedMessage(p) : undefined;
        const userMessage = type === 'event_msg' && sub === 'user_message' && typeof p.message === 'string'
            ? p.message : completed?.role === 'user' ? completed.text : undefined;
        if (typeof userMessage === 'string') {
            const text = codexUserText(userMessage);
            if (!text) { continue; }
            turn++;
            prompts[turn] = text; started[turn] = ts; turns[turn] = blankTurn();
            if (currentModel) { (turnModels[turn] ?? (turnModels[turn] = new Set())).add(currentModel); }
            if (currentEffort) { (turnAttrs[turn] ?? (turnAttrs[turn] = {})).effort = currentEffort; }
            messages.push({ role: 'user', ts, text, turn, turnStart: true });
            if (!title) { title = codexPromptTitle(userMessage); }
            continue;
        }
        const assistantMessage = type === 'event_msg' && sub === 'agent_message' && typeof p.message === 'string'
            ? p.message : completed?.role === 'assistant' ? completed.text : undefined;
        if (typeof assistantMessage === 'string') {
            // 0.149 writes the same answer once as AgentMessage and once as a
            // response_item. addAssistant's per-turn key keeps that one answer
            // one row while still accepting either half if a rollout is torn.
            addAssistant(assistantMessage, ts); continue;
        }
        if (type === 'event_msg' && sub === 'token_count' && p.info && typeof p.info === 'object') {
            const info = p.info as Record<string, unknown>;
            const total = codexUsage(info.total_token_usage);
            const delta = usageDiff(total, previous);
            previous = total;
            usage.input = total.input; usage.output = total.output;
            usage.cacheWrite = total.cacheWrite; usage.cacheRead = total.cacheRead;
            if (typeof info.model_context_window === 'number') { ctxLimit = info.model_context_window; }
            const last = info.last_token_usage && typeof info.last_token_usage === 'object'
                ? info.last_token_usage as Record<string, unknown> : {};
            // ‼️ The window held the request's whole input AND its reply, which is
            // what `contextAfter` means on the Claude side — reading only
            // `input_tokens` here made the viewer's gauge disagree with the same
            // session's Ctx cell in every table (X-35).
            if (typeof last.input_tokens === 'number') {
                const lastU = codexUsage(last);
                ctxTokens = lastU.input + lastU.cacheRead + lastU.cacheWrite + lastU.output;
                ctxTs = ts;
            }
            const model = typeof info.model === 'string' && info.model ? info.model : currentModel;
            if (model) { currentModel = model; models.add(model); }
            const dt = totalTokens(delta);
            if (turn && dt > 0) {
                const acc = turns[turn] ?? (turns[turn] = blankTurn());
                const dc = model ? pricing.costFor(model, delta, ts) : 0;
                const dw = model ? weightedTokens(model, delta) : dt;
                acc.tokens += dt; acc.wTokens += dw; acc.cost += dc; acc.apiCalls++;
                acc.endCtx = ctxTokens; cost += dc; wTokens += dw;
            }
            continue;
        }
        if (type === 'response_item' && (sub === 'function_call' || sub === 'custom_tool_call')) {
            const name = typeof p.name === 'string' && p.name ? p.name : 'tool';
            const id = typeof p.call_id === 'string' ? p.call_id : '';
            addTool(name, p.arguments ?? p.input ?? {}, id, ts); continue;
        }
        if (type === 'response_item' && (sub === 'function_call_output' || sub === 'custom_tool_call_output')) {
            const id = typeof p.call_id === 'string' ? p.call_id : '';
            const text = clipTool(asText(p.output));
            const isError = /(^|\b)(error|failed|exit code [1-9])\b/i.test(text.slice(0, 500));
            if (isError) { errors++; }
            messages.push({ role: 'toolResult', ts, text, tool: calls.get(id), isError, kind: 'result', turn: turn || undefined });
            continue;
        }
        if (type === 'response_item' && sub === 'message' && p.role === 'assistant') {
            addAssistant(asText(p.content), ts); continue;
        }
        if (type === 'response_item' && sub === 'reasoning' && turn) {
            const acc = turns[turn] ?? (turns[turn] = blankTurn());
            acc.steps++; acc.thinking++;
        }
    }
    if (!saw) { return undefined; }
    const table = finishTurns(messages, turns, prompts, started, turnModels, turnAttrs);
    return {
        engine: 'codex', sessionId, title, cwd, permissionMode: '', firstTs, lastTs,
        models: [...models], usage, totalTokens: totalTokens(usage), totalWTokens: Math.round(wTokens),
        cost, errors, toolCalls,
        context: { tokens: ctxTokens, ts: ctxTs, model: currentModel, ...(ctxLimit ? { limit: ctxLimit } : {}) },
        turnCount: table.length, turnTotals: turns, turns: table, messages
    };
}

interface GeminiTokens { input: number; output: number; cached: number; thoughts: number; tool: number }

function geminiTokens(value: unknown): GeminiTokens | undefined {
    if (!value || typeof value !== 'object') { return undefined; }
    const o = value as Record<string, unknown>;
    const at = (...keys: string[]) => {
        for (const k of keys) { if (typeof o[k] === 'number') { return Math.max(0, Math.trunc(o[k] as number)); } }
        return 0;
    };
    return {
        input: at('input', 'prompt', 'promptTokenCount', 'input_tokens'),
        output: at('output', 'candidates', 'candidatesTokenCount', 'output_tokens'),
        cached: at('cached', 'cachedContentTokenCount', 'cache_read_input_tokens'),
        thoughts: at('thoughts', 'thoughtsTokenCount', 'reasoning_output_tokens'),
        tool: at('tool', 'toolUsePromptTokenCount')
    };
}

function parseGemini(raw: string, file: string, pricing: PricingEngine): ParsedCliViewer | undefined {
    let root: unknown;
    try { root = JSON.parse(raw); } catch { root = undefined; }
    const records: Record<string, unknown>[] = [];
    let top: Record<string, unknown> = {};
    if (root && typeof root === 'object' && !Array.isArray(root)) {
        top = root as Record<string, unknown>;
        records.push(top);
        if (Array.isArray(top.messages)) {
            records.push(...top.messages.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object'));
        }
    } else {
        for (const line of raw.split('\n')) {
            if (!line.trim()) { continue; }
            try {
                const o = JSON.parse(line);
                if (o && typeof o === 'object') { records.push(o as Record<string, unknown>); }
            } catch { /* skip */ }
        }
    }
    // Claude JSONL also contains `user`/`assistant` rows. A Gemini transcript
    // must identify at least one model row in Gemini's own vocabulary; without
    // that positive marker this parser would steal every Claude file before the
    // richer native parser below got a chance to read it.
    if (!records.some(r => String(r.type ?? '') === 'gemini')) {
        return undefined;
    }
    const messages: CliViewMessage[] = [];
    const usage = emptyUsage();
    const models = new Set<string>();
    const turns: Record<number, TurnAcc> = {};
    const prompts: Record<number, string> = {};
    const started: Record<number, number> = {};
    const turnModels: Record<number, Set<string>> = {};
    const attrs: Record<number, Record<string, string>> = {};
    let sessionId = String(top.sessionId ?? top.session_id ?? path.basename(file, path.extname(file)));
    let model = String(top.model ?? ''), turn = 0, firstTs = stamp(top.startTime), lastTs = stamp(top.lastUpdated);
    let title = '', cost = 0, wTokens = 0, toolCalls = 0, errors = 0;
    for (const r of records) {
        if (r.sessionId || r.session_id) { sessionId = String(r.sessionId ?? r.session_id); }
        if (typeof r.model === 'string' && r.model) { model = r.model; models.add(model); }
        const ts = stamp(r.timestamp ?? r.created_at ?? r.startTime);
        if (ts) { if (!firstTs) { firstTs = ts; } lastTs = Math.max(lastTs, ts); }
        const type = String(r.type ?? r.role ?? '');
        if (type === 'user') {
            // ‼️ The index opens its turn on exactly this (S-40) — one rule, one
            // function, or the two number the same file differently.
            const text = geminiUserOpening(r);
            if (!text) { continue; }
            turn++; prompts[turn] = text; started[turn] = ts; turns[turn] = blankTurn();
            messages.push({ role: 'user', ts, text, turn, turnStart: true });
            if (!title) { title = conversationTitle(text); }
            continue;
        }
        if (type === 'gemini' || type === 'model' || type === 'assistant') {
            const used = geminiTokens(r.tokens ?? r.usage);
            let mt = 0, mw = 0, mc = 0;
            if (used) {
                const u: Usage = {
                    input: Math.max(0, used.input - used.cached) + used.tool,
                    output: used.output + used.thoughts, cacheWrite: 0, cacheRead: used.cached
                };
                addUsage(usage, u); mt = totalTokens(u);
                if (model) { mc = pricing.costFor(model, u, ts); mw = weightedTokens(model, u); }
                cost += mc; wTokens += mw;
                if (turn) {
                    const a = turns[turn] ?? (turns[turn] = blankTurn());
                    a.tokens += mt; a.wTokens += mw; a.cost += mc; a.apiCalls++; a.endTs = Math.max(a.endTs, ts);
                }
            }
            if (turn && model) { (turnModels[turn] ?? (turnModels[turn] = new Set())).add(model); }
            const text = asText(r.content ?? r.message ?? r.text ?? r.response).trim();
            if (text) {
                messages.push({ role: 'assistant', ts, text, model: model || undefined,
                    tokens: mt || undefined, wTokens: Math.round(mw) || undefined,
                    cost: mc || undefined, kind: 'say', turn: turn || undefined });
                if (turn) { turns[turn].steps++; }
            }
            continue;
        }
        if (/tool.*(call|use)/i.test(type)) {
            const name = String(r.name ?? r.tool ?? 'tool'); toolCalls++;
            messages.push({ role: 'tool', ts, tool: name, input: clipTool(asText(r.input ?? r.args ?? {})),
                kind: stepKindForTool(name), turn: turn || undefined });
            if (turn) { turns[turn].steps++; }
        } else if (/tool.*(result|response)/i.test(type)) {
            const text = clipTool(asText(r.output ?? r.result ?? r.content));
            const isError = r.error === true || /(^|\b)(error|failed)\b/i.test(text.slice(0, 500));
            if (isError) { errors++; }
            messages.push({ role: 'toolResult', ts, text, isError, kind: 'result', turn: turn || undefined });
        }
    }
    const table = finishTurns(messages, turns, prompts, started, turnModels, attrs);
    return {
        engine: 'gemini', sessionId, title, cwd: '', permissionMode: '', firstTs, lastTs,
        models: [...models], usage, totalTokens: totalTokens(usage), totalWTokens: Math.round(wTokens),
        cost, errors, toolCalls, context: { tokens: 0, ts: 0, model },
        turnCount: table.length, turnTotals: turns, turns: table, messages
    };
}

/**
 * S-33 — an OpenCode conversation, out of the export the harvester cached.
 *
 * ‼️ REASONING IS DRAWN HERE, NOT COUNTED AND DROPPED. The Codex reader treats a
 * `reasoning` item as a tally (`thinking++`) because a Codex rollout carries no
 * text for it. OpenCode's export DOES — measured: a `reasoning` part with the
 * model's own words and its own start/end times. Turning that into a number
 * would be throwing away the half of the answer that explains the other half,
 * and the backlog item asks for these parts by name.
 *
 * ‼️ AND THE TOKENS ARE PER MESSAGE, NOT CUMULATIVE. `info.tokens` on the
 * document is the conversation's running total; `message.info.tokens.total` is
 * that one turn's. Measured: turn 2 came back with input 36 against turn 1's
 * 6196, so a running total would have to go DOWN — which is what proves it is
 * not one. No delta is subtracted; doing what the Codex reader correctly does
 * would report every turn but the first as costing nothing.
 */
function parseOpencode(raw: string): ParsedCliViewer | undefined {
    const doc = opencodeExport(raw);
    if (!doc) { return undefined; }
    const messages: CliViewMessage[] = [];
    const turns: Record<number, TurnAcc> = {};
    const prompts: Record<number, string> = {};
    const started: Record<number, number> = {};
    const turnModels: Record<number, Set<string>> = {};
    const attrs: Record<number, Record<string, string>> = {};
    const usage = emptyUsage();
    const models = new Set<string>();
    let turn = 0, toolCalls = 0, errors = 0, wTokens = 0, ctxTokens = 0, ctxTs = 0;
    let firstTs = doc.created, lastTs = doc.updated;

    for (const m of doc.messages) {
        const model = m.model || doc.model;
        if (model) { models.add(model); }
        if (m.ts) { if (!firstTs) { firstTs = m.ts; } lastTs = Math.max(lastTs, m.endTs ?? m.ts); }
        if (m.role === 'user') {
            const text = m.parts.filter(p => p.kind === 'text' && p.text?.trim())
                .map(p => p.text as string).join('\n').trim();
            // An attachment-only message is still the user speaking; it opens a
            // turn with the file's name rather than vanishing.
            const files = m.parts.filter(p => p.kind === 'file');
            const opening = text || files.map(p => p.filename || p.text || 'attachment').join(', ');
            if (!opening) { continue; }
            turn++;
            prompts[turn] = opening;
            started[turn] = m.ts;
            turns[turn] = blankTurn();
            if (model) { turnModels[turn] = new Set([model]); }
            if (m.agent || doc.agent) { attrs[turn] = { agent: m.agent || doc.agent }; }
            messages.push({ role: 'user', ts: m.ts, text: opening, turn, turnStart: true });
            for (const p of files) {
                messages.push({
                    role: 'system', ts: p.ts ?? m.ts, turn,
                    text: `attached: ${p.filename || p.text || 'file'}${p.mime ? ` (${p.mime})` : ''}`
                });
            }
            continue;
        }
        const acc = turn ? (turns[turn] ?? (turns[turn] = blankTurn())) : undefined;
        if (turn && model) { (turnModels[turn] ?? (turnModels[turn] = new Set())).add(model); }
        for (const p of m.parts) {
            const ts = p.ts ?? m.ts;
            if (p.kind === 'reasoning') {
                messages.push({ role: 'assistant', ts, text: p.text, model, kind: 'think', turn: turn || undefined });
                if (acc) { acc.steps++; acc.thinking++; }
                continue;
            }
            if (p.kind === 'text') {
                messages.push({ role: 'assistant', ts, text: p.text, model, kind: 'say', turn: turn || undefined });
                if (acc) { acc.steps++; }
                continue;
            }
            if (p.kind === 'tool') {
                const name = p.tool || 'tool';
                toolCalls++;
                messages.push({
                    role: 'tool', ts, tool: name, input: clipTool(asText(p.input ?? {})),
                    kind: stepKindForTool(name), turn: turn || undefined
                });
                if (acc) { acc.steps++; }
                if (p.isError) { errors++; }
                // A call still running when the export was taken has a status
                // and no output — say which it was instead of drawing a blank
                // result that reads as "it returned nothing".
                const body = p.output || (p.status && p.status !== 'completed'
                    ? `(${p.status})` : '');
                if (body) {
                    messages.push({
                        role: 'toolResult', ts: p.endTs ?? ts, text: clipTool(body),
                        tool: name, isError: p.isError, kind: 'result', turn: turn || undefined
                    });
                }
                continue;
            }
            if (p.kind === 'step-finish' && acc) { acc.apiCalls++; }
        }
        if (m.tokens) {
            const u: Usage = {
                // reasoning is NOT inside output on this engine — see the file
                // header of `opencodehistory.ts` for the arithmetic.
                input: m.tokens.input, output: m.tokens.output + m.tokens.reasoning,
                cacheWrite: m.tokens.cacheWrite, cacheRead: m.tokens.cacheRead
            };
            addUsage(usage, u);
            const w = model ? weightedTokens(model, u) : totalTokens(u);
            wTokens += w;
            if (acc) {
                acc.tokens += m.tokens.total; acc.wTokens += w;
                acc.endCtx = m.tokens.total; acc.endTs = m.endTs ?? m.ts;
            }
            ctxTokens = m.tokens.total;
            ctxTs = m.endTs ?? m.ts;
        }
        // ‼️ THE ENGINE PUBLISHES ITS OWN DOLLARS, so the per-turn figure is the
        // one it stated (`costSource: 'cli'`); a free model's 0 is a real zero.
        if (acc && typeof m.cost === 'number') { acc.cost += m.cost; }
        // A turn the engine cut says so — otherwise a short answer and an
        // aborted one look identical in the table.
        if (turn && m.finish && m.finish !== 'stop') {
            messages.push({
                role: 'system', ts: m.endTs ?? m.ts, turn,
                text: `— the engine ended this turn: ${m.finish} —`
            });
        }
    }
    const table = finishTurns(messages, turns, prompts, started, turnModels, attrs);
    return {
        engine: 'opencode', sessionId: doc.id,
        title: opencodeTitle(doc, conversationTitle),
        cwd: doc.directory, permissionMode: doc.agent, firstTs, lastTs,
        models: [...models], usage, totalTokens: totalTokens(usage),
        totalWTokens: Math.round(wTokens), cost: doc.cost, errors, toolCalls,
        context: { tokens: ctxTokens, ts: ctxTs, model: doc.model },
        turnCount: table.length, turnTotals: turns, turns: table, messages
    };
}

/** Parse a foreign CLI transcript into the Session Viewer vocabulary. Claude
 * files return undefined and continue through the existing, richer parser. */
/**
 * ‼️ S-37 — AN ANTIGRAVITY CONVERSATION, OUT OF THE STEP LOG THE CLI WRITES.
 *
 * The row and the page have to come from the same place or one of them lies.
 * `agySessionsSource` was changed to read `brain/<id>/…/transcript.jsonl`
 * because the CLI's own index had gone stale — and that gave every `agy` row a
 * FILE for the first time, which is what makes a row openable. Without a reader
 * here the page fell through to the Claude parser, found nothing it recognised,
 * and drew "no messages to show" over a conversation whose every step was on
 * disk: the hover could state when the run started while the page it opened was
 * blank.
 *
 * The format is one JSON object per line, `type` naming what the step was:
 * `USER_INPUT` (wrapped in the CLI's own `<USER_REQUEST>` tags), `PLANNER_RESPONSE`
 * for what the model said, `RUN_COMMAND` and `CODE_ACTION` for what it did,
 * `ERROR_MESSAGE`, and `CHECKPOINT` — which is the CLI telling itself that it
 * truncated the conversation, and is drawn rather than hidden because a reader
 * who cannot see WHERE the history was cut cannot tell a short conversation
 * from a summarised one.
 *
 * Figures stay zero for the same reason the row's do: the tokens live in
 * `conversations/<id>.db` as protobuf with no schema on disk. The turn table is
 * still built, because turn boundaries and durations ARE in the log.
 */
function parseAgyBrain(raw: string, file: string): ParsedCliViewer | undefined {
    if (!/"step_index"/.test(raw)) { return undefined; }
    const steps: AgyStep[] = [];
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('{')) { continue; }
        try {
            const o = JSON.parse(t) as AgyStep;
            if (typeof o.step_index === 'number' && typeof o.type === 'string') { steps.push(o); }
        } catch { /* a torn last line */ }
    }
    if (!steps.length) { return undefined; }

    const messages: CliViewMessage[] = [];
    const turns: Record<number, TurnAcc> = {};
    const prompts: Record<number, string> = {};
    const started: Record<number, number> = {};
    const models: Record<number, Set<string>> = {};
    const attrs: Record<number, Record<string, string>> = {};
    let turn = 0, firstTs = 0, lastTs = 0, errors = 0, toolCalls = 0, cwd = '';
    // The call is announced one step before the step that answers it — see
    // `agyToolName` in cliTranscripts.ts for the measurement.
    let pending: AgyToolCall | undefined;

    for (const s of steps) {
        const ts = stamp(s.created_at);
        if (ts) { firstTs = firstTs ? Math.min(firstTs, ts) : ts; lastTs = Math.max(lastTs, ts); }
        let text = asText(s.content);
        // The CLI names the field it cut, so the page says so instead of letting
        // a clipped output read as the whole of it.
        if (s.truncated_fields?.includes('content') && text) {
            text += '\n… [the CLI truncated this itself — `truncated_fields: ["content"]`]';
        }
        const failed = agyStepFailed(s);

        if (s.type === 'USER_INPUT') {
            const m = /<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i.exec(text);
            const ask = (m ? m[1] : text).trim();
            if (!ask) { continue; }
            turn++;
            prompts[turn] = ask;
            started[turn] = ts;
            turns[turn] = blankTurn();
            messages.push({ role: 'user', ts, text: ask, turn, turnStart: true });
            continue;
        }
        const announced = agyAnnouncedCall(s);
        if (announced) { pending = announced; }
        if (s.type === 'PLANNER_RESPONSE') {
            // ‼️ AN ANNOUNCEMENT IS NOT A MESSAGE. The step that carries
            // `tool_calls` has no prose at all; drawing it as an empty assistant
            // bubble would put a blank speech balloon above every single tool
            // call in the conversation.
            if (!text.trim()) { continue; }
            messages.push({ role: 'assistant', ts, text, turn: turn || undefined });
            if (turn) { turns[turn].steps++; turns[turn].apiCalls++; turns[turn].endTs = ts; }
            continue;
        }
        if (agyIsToolStep(s)) {
            toolCalls++;
            const call = s.tool_calls?.[0] ?? pending;
            const tool = agyToolName(s, pending);
            pending = undefined;
            // The call and its answer, drawn as the two things they are: the
            // command (and what it was about to write) above, the output below.
            const detail = agyToolDetail(call);
            const written = agyArg(call?.args, 'CodeContent') || agyArg(call?.args, 'ReplacementContent');
            // ‼️ AN EMPTY CALL BUBBLE IS A LIE OF OMISSION. Measured: two calls
            // in this store answer an announcement the log no longer holds (the
            // CLI truncates its own history at a CHECKPOINT), so there are no
            // arguments to show. Saying so beats a blank box that reads as "this
            // tool was called with nothing".
            const shown = [detail, written].filter(Boolean).join('\n\n');
            messages.push({
                role: 'tool', ts, tool,
                input: shown ? clipTool(shown)
                    : '(the step log holds no arguments for this call — its announcement is not in the file)',
                kind: stepKindForTool(tool), turn: turn || undefined
            });
            if (text.trim() || failed) {
                if (failed) { errors++; }
                const code = typeof s.exit_code === 'number' ? s.exit_code : undefined;
                const head = code !== undefined && code !== 0 ? `exit ${code}\n` : '';
                messages.push({
                    role: 'toolResult', ts, tool, isError: failed,
                    text: clipTool(head + (text.trim() || (failed ? 'failed' : ''))),
                    turn: turn || undefined
                });
            }
            if (turn) { turns[turn].steps++; turns[turn].endTs = ts; }
            continue;
        }
        if (s.type === 'ERROR_MESSAGE') {
            errors++;
            messages.push({ role: 'system', ts, text: text || 'error', isError: true, turn: turn || undefined });
            continue;
        }
        if (s.type === 'CONVERSATION_HISTORY') {
            // A marker with no body — the CLI saying it loaded the thread.
            continue;
        }
        // CHECKPOINT (the CLI truncating its own history), SYSTEM_MESSAGE,
        // EPHEMERAL_MESSAGE and anything a later version adds. A checkpoint is
        // DRAWN rather than hidden: a reader who cannot see where the history
        // was cut cannot tell a short conversation from a summarised one.
        if (text.trim()) {
            messages.push({ role: 'system', ts, text, isError: failed, turn: turn || undefined });
        }
    }
    if (!messages.length) { return undefined; }

    const table = finishTurns(messages, turns, prompts, started, models, attrs);
    const firstUser = messages.find(m => m.role === 'user' && m.text?.trim());
    return {
        engine: 'agy',
        // The conversation IS its folder: `brain/<id>/.system_generated/logs/…`.
        sessionId: file.replace(/\\/g, '/').split('/brain/')[1]?.split('/')[0]
            ?? path.basename(path.dirname(path.dirname(path.dirname(file)))),
        title: firstUser?.text ? conversationTitle(firstUser.text) : 'Antigravity session',
        cwd, permissionMode: '', firstTs, lastTs,
        models: [], usage: emptyUsage(),
        // ‼️ Honest zeros, not measured ones — see the block above.
        totalTokens: 0, totalWTokens: 0, cost: 0,
        errors, toolCalls, context: { tokens: 0, ts: 0, model: '' },
        turnCount: table.length, turnTotals: turns, turns: table, messages
    };
}

export function parseCliViewer(raw: string, file: string, pricing: PricingEngine): ParsedCliViewer | undefined {
    // Order is by how positively each reader identifies its own document, not by
    // age: the Console snapshot and the OpenCode export both carry a marker
    // nothing else writes (`format` / a `ses_` id), so neither can steal a file
    // from the readers below them, which recognise their formats by shape.
    // `parseAgyBrain` is as positive as those two — nothing else writes
    // `step_index` — so it sits with them rather than in the guessing half.
    return parseFarmConsole(raw) ?? parseOpencode(raw) ?? parseAgyBrain(raw, file)
        ?? parseCodex(raw, file, pricing) ?? parseGemini(raw, file, pricing);
}
