/**
 * X-516 — WHICH ENGINES ONE ROUTE SERVES, and the rules that keep every marked
 * engine a working one. A route is one record (address, key, tiers) that Claude
 * Code and OpenCode can both be given; `engines` says which. Pure.
 */
import { lendableToOpenCode, routeModelList } from './routeModels';

/** The engines a route can be given, in the order a route stores them. */
export const ROUTE_ENGINES: readonly string[] = ['claude', 'opencode'];

/**
 * `['opencode','claude']`, `"claude, opencode"` → `['claude','opencode']`: once
 * each, known engines in ROUTE_ENGINES order and any other name after them (so a
 * refusal can name it). Undefined when the value was not given at all.
 */
export function engineNames(v: unknown): string[] | undefined {
    if (v === undefined || v === null) { return undefined; }
    const raw = Array.isArray(v) ? v : String(v).split(',');
    const names = [...new Set(raw.map(x => (typeof x === 'string' ? x.trim().toLowerCase() : '')).filter(Boolean))];
    return [...ROUTE_ENGINES.filter(e => names.includes(e)), ...names.filter(n => !ROUTE_ENGINES.includes(n))];
}

type RouteShape = { baseUrl?: string; opencodeUrl?: string; tiers?: Record<string, string> };

/**
 * A route whose engines were not stated serves every engine it can: OpenCode
 * when it could be lent there, Claude Code unless its only address is the
 * OpenCode one (Claude Code needs the Anthropic-style endpoint).
 */
export function defaultEngines(p: RouteShape): string[] {
    if (!lendableToOpenCode({ ...p, engines: ['opencode'] })) { return ['claude']; }
    return p.opencodeUrl && !p.baseUrl ? ['opencode'] : ['claude', 'opencode'];
}

/** Everything wrong with a route's engines and the addresses they need, together. */
export function enginesRefusal(p: RouteShape & { engines: readonly string[] }, known?: readonly string[]): string[] {
    const out: string[] = [];
    if (!p.engines.length) {
        out.push(`a route serves at least one engine — one of: ${ROUTE_ENGINES.join(', ')}.`);
    }
    for (const e of p.engines) {
        if (!ROUTE_ENGINES.includes(e) || (known?.length && !known.includes(e))) {
            out.push(`engine "${e}" cannot be given a route — one of: ${ROUTE_ENGINES.join(', ')}.`);
        }
    }
    if (p.engines.includes('opencode')) {
        if (!p.opencodeUrl && !p.baseUrl) {
            out.push('a route marked for OpenCode needs an address to send it to: an endpoint, or an OpenCode endpoint.');
        }
        if (!routeModelList(p.tiers).length) {
            out.push('a route marked for OpenCode needs at least one model: write one into a tier.');
        }
    }
    if (p.opencodeUrl && !p.baseUrl && p.engines.includes('claude')) {
        out.push('this route has only an OpenCode endpoint, so it can serve OpenCode alone — Claude Code needs the '
            + 'Anthropic-style endpoint; fill Endpoint, or mark the route for opencode only.');
    }
    return out;
}

/**
 * ‼️ CLAUDE CODE APPENDS `/v1/messages` TO THE ENDPOINT, so one written with
 * `/v1` at its end is asked at `…/v1/v1/messages` and every turn fails (measured
 * on a live route). The refusal says the address to write instead.
 */
export function v1Refusal(baseUrl: string | undefined): string {
    const u = String(baseUrl ?? '').trim();
    if (!/\/v1\/?$/i.test(u)) { return ''; }
    return `the endpoint "${u}" ends in /v1, but Claude Code adds /v1/messages itself, so every request would go `
        + `to …/v1/v1/messages — write "${u.replace(/\/v1\/?$/i, '')}".`;
}

/** A model limit is a positive whole number of tokens, or absent. */
export function limitRefusal(name: 'context' | 'output', v: number | undefined): string {
    if (v === undefined || (Number.isInteger(v) && v > 0)) { return ''; }
    return `${name} is a positive whole number of tokens (the ${name === 'context' ? 'context window' : 'longest answer'} `
        + 'of the route\'s models), or empty.';
}

/** `providers.add` / `providers.set` take `engines`; the single `engine` is refused by name. */
export function routeArgsRefusal(args: Record<string, unknown> | undefined): string {
    return args && Object.prototype.hasOwnProperty.call(args, 'engine')
        ? 'a route takes engines, not engine — engines: claude, opencode or both (a list, or comma-separated).'
        : '';
}
