// Kapıcı MCP — the three tools, each one bridge op (B-28).
//
// The bridge helper Agent Farm stages (bridge/af.js) is loaded rather than
// copied: one implementation of the request/response protocol, its claim
// marker and its timeouts. Staged, this server sits at <globalStorage>/mcp/
// kapici and the helper at <globalStorage>/bridge; from a checkout the helper
// is out/service/af.js.

import * as fs from 'fs';
import * as path from 'path';

type Dict = Record<string, unknown>;
interface Reply { ok: boolean; result?: unknown; error?: string; detail?: unknown }
interface Gateway {
    executeBridgeRequest(op: string, args: Dict, bridgeDir: string, timeoutMs: number): Promise<Reply>;
    defaultBridgeDir(): string;
}

/** How long Agent Farm has to TAKE a request before it is called absent. */
const CLAIM_MS = Number(process.env.KAPICI_MCP_CLAIM_MS) || 8000;
/** How long a taken request may run (an LLM judge waits at least a minute). */
const ANSWER_MS = Number(process.env.KAPICI_MCP_ANSWER_MS) || 180000;

let gw: Gateway | undefined;
function gateway(): Gateway {
    if (gw) { return gw; }
    for (const f of [path.join(__dirname, '..', '..', 'bridge', 'af.js'), path.join(__dirname, '..', '..', 'service', 'af.js')]) {
        if (fs.existsSync(f)) { gw = require(f) as Gateway; return gw; }
    }
    throw new Error('Agent Farm\'s bridge helper (af.js) is not beside this server — reinstall Agent Farm, or register the MCP again from Farm Settings ▸ Gatekeeper.');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function answerOf(file: string, until: number): Promise<unknown> {
    while (Date.now() < until) {
        if (fs.existsSync(file)) {
            await sleep(30);
            const r = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) as Reply;
            try { fs.unlinkSync(file); } catch { /* the bridge sweeps it */ }
            if (r.ok) { return r.result; }
            throw new Error(r.error || 'Agent Farm refused the request');
        }
        await sleep(100);
    }
    throw new Error(`Agent Farm took the request and is still working on it after ${Math.round(ANSWER_MS / 1000)}s; its answer will land in ${file}.`);
}

/** One bridge op, with the two failures an agent must be able to tell apart. */
export async function viaBridge(op: string, args: Dict): Promise<unknown> {
    const g = gateway();
    const started = Date.now();
    const r = await g.executeBridgeRequest(op, args, g.defaultBridgeDir(), CLAIM_MS);
    if (r.ok) { return r.result; }
    const d = (r.detail ?? {}) as Dict;
    if (d.state === 'unclaimed') {
        throw new Error('Agent Farm is not answering: VS Code is closed or the Agent Farm extension is not active. '
            + 'Gatekeeper answers only through Agent Farm (its key never leaves it) — open VS Code and ask again. Nothing ran.');
    }
    if (d.state === 'running' && typeof d.response === 'string') { return answerOf(d.response, started + ANSWER_MS); }
    throw new Error(r.error || 'Agent Farm refused the request');
}

/** A statePath the agent gave relative to where it works is made absolute here, where that is known. */
function withState(a: Dict): Dict {
    const out: Dict = {};
    if (a.state !== undefined) { out.state = a.state; }
    if (typeof a.statePath === 'string' && a.statePath.trim()) { out.statePath = path.resolve(a.statePath.trim()); }
    return out;
}
const pick = (a: Dict, keys: string[]): Dict => Object.fromEntries(keys.filter(k => a[k] !== undefined).map(k => [k, a[k]]));

const STATE = {
    state: { description: 'What Gatekeeper reads: a text, or an object (it is pruned and masked before it is sent anywhere).' },
    statePath: { type: 'string', description: 'Instead of state: a file to read it from (a .json file is read as an object). A relative path is taken from this server\'s working folder.' }
};

export const TOOLS: { name: string; description: string; inputSchema: Dict; handler(a: Dict): Promise<unknown> }[] = [
    {
        name: 'kapici_eval',
        description: 'Put a state to a Gatekeeper rule and get its verdict: passed, decision, confidence, each answer, reason, who answered (provider) and how fast. '
            + 'Never fails for a missing key or rule — the verdict then says fallback and why. Every call leaves one audit line in Agent Farm. '
            + 'Gatekeeper answers typed questions (yes/no, a choice, a score) without a model; kapici_rules lists the rules.',
        inputSchema: {
            type: 'object',
            properties: {
                rule: { type: 'string', description: 'The rule id, e.g. trigger.has-work.' },
                ...STATE,
                criteria: { description: 'Call-time options per question: a list, or {key: text}. A "$call" question needs them.' },
                project: { type: 'string', description: 'A project root: its .kapici/ rules win over the shared ones.' },
                noCache: { type: 'boolean', description: 'Ask again even when the same input was answered recently.' }
            },
            required: ['rule']
        },
        handler: a => viaBridge('kapici.eval', { ...pick(a, ['rule', 'criteria', 'project', 'noCache']), ...withState(a), consumer: 'mcp' })
    },
    {
        name: 'kapici_ask',
        description: 'Ask Gatekeeper typed questions without writing a rule — a one-off. Each question: {type: noul | choice | score, instructions, criteria?, check?}. '
            + 'Answers every question with its confidence; a question with a local check is answered here and never sent.',
        inputSchema: {
            type: 'object',
            properties: {
                ...STATE,
                questions: { type: 'object', description: '{id: {type, instructions, criteria?, check?}}' },
                providers: { type: 'array', items: { type: 'string' }, description: 'Who to ask, in order (heuristic, jev, llm). Default: Agent Farm\'s setting.' },
                project: { type: 'string', description: 'A project root, for its .kapici/ settings.' }
            },
            required: ['questions']
        },
        handler: a => viaBridge('kapici.ask', { ...pick(a, ['questions', 'providers', 'project']), ...withState(a), consumer: 'mcp' })
    },
    {
        name: 'kapici_rules',
        description: 'Every Gatekeeper rule visible: id, version, description, the layer that won (builtin | system | project), its file, providers, questions, '
            + 'thresholds and failure path, golden example count — and every rule file that failed to load, with the reason.',
        inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'A project root, to include its .kapici/ rules.' } } },
        handler: a => viaBridge('kapici.rules', pick(a, ['project']))
    }
];
