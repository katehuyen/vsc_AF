/**
 * Which scope a phone needs to call a bridge op — the design's four levels
 * (read · answer · manage · admin; a phone pairs at manage):
 *
 *   read    pages and events, and ops that only look (their verb says so)
 *   answer  + questions, permissions and approvals
 *   manage  + starting sessions, messages, cancelling, tasks and queues
 *   admin   + settings, accounts, engines and agent files
 *
 * Derived from the op's name, failing upward: an op is `read` only when its
 * verb is a known looking verb, and anything unrecognised needs `manage`, so a
 * new write op is never readable by accident. Admin namespaces need admin even
 * to look — their reads carry configuration.
 */
import { SCOPES } from './contract';
import type { OpResult, RemoteCaller } from './port';

export type Scope = 'read' | 'answer' | 'manage' | 'admin';

const ANSWER_OPS = new Set(['console.answer', 'sessions.answerPermission', 'needs.act']);
const ADMIN_NAMESPACES = new Set(['settings', 'accounts', 'agents', 'providers', 'engines', 'telegram', 'web', 'farm', 'policies', 'browser']);
const READ_VERBS = new Set([
    'list', 'get', 'read', 'status', 'find', 'search', 'history', 'health', 'summary', 'timeline',
    'peek', 'preview', 'show', 'stats', 'catalog', 'ops', 'ping', 'whoami', 'versions', 'waits', 'trace',
]);
/** Farm-level looks a phone makes on connect; everything else in `farm` is admin. */
const OPEN_FARM_OPS = new Set(['farm.ping', 'farm.health', 'farm.ops']);

export function requiredScope(op: string): Scope {
    const dot = op.indexOf('.');
    const ns = dot < 0 ? op : op.slice(0, dot);
    const verb = op.slice(op.lastIndexOf('.') + 1);
    if (ANSWER_OPS.has(op)) { return 'answer'; }
    if (OPEN_FARM_OPS.has(op)) { return 'read'; }
    if (ADMIN_NAMESPACES.has(ns)) { return 'admin'; }
    if (READ_VERBS.has(verb)) { return 'read'; }
    return 'manage';
}

/** Whether a device paired at `scope` may call `op`. An unknown scope may call nothing. */
export function scopeAllows(scope: string, op: string): boolean {
    const have = SCOPES.indexOf(scope);
    return have >= 0 && have >= SCOPES.indexOf(requiredScope(op));
}

/** Whether a device paired at `have` holds at least `needed`. Unknown scopes hold nothing. */
export function scopeAtLeast(have: string, needed: string): boolean {
    const h = SCOPES.indexOf(have), n = SCOPES.indexOf(needed);
    return h >= 0 && n >= 0 && h >= n;
}

type CallOp =(op: string, args: Record<string, unknown>, caller: RemoteCaller) => Promise<OpResult>;

/** `callOp` behind the scope check; a refusal names the scope the op needs. */
export function scopeGated(callOp: CallOp): CallOp {
    return (op, args, caller) => scopeAllows(caller.scope, op)
        ? callOp(op, args, caller)
        : Promise.resolve({ ok: false, error: `scope: ${op} needs ${requiredScope(op)}, this device has ${caller.scope}` });
}
