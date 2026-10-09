/**
 * X-517 F — IS THE WAY WE LEND OPENCODE A ROUTE STILL UNDERSTOOD BY THE OPENCODE ON THIS MACHINE?
 *
 * OpenCode updates itself silently (measured: 1.18.19 → 1.18.35 during one session), so the shape
 * opencodeRoutes.ts writes is checked again whenever the CLI's version changes: a probe route in each
 * shape we write, against a local server that answers 401 to everything. This is the pure half — the
 * probe routes, the commands, and the reading of what came back; opencodeContractProbe.ts runs it.
 * ‼️ Never the bare TUI: measured 2026-10-09, a TUI probe cut off mid self-update broke the install.
 */
import { fragmentFor, LentRoute, modelRefOf, routeKeyEnvName, wireIdOf } from './opencodeRoutes';
import { opencodeModelsListArgs, opencodeRunArgs } from './opencode';

export const PROBE_ROUTE_ID = 'probe';
export const PROBE_MODEL = 'probe-model';
/** A fixed stand-in, never a key: the probe proves where the header lands, not that anything signs in. */
export const PROBE_KEY = 'af-contract-probe-not-a-key';
export const PROBE_PROMPT = 'Reply with exactly: OK';

export type ContractShape = 'anthropic' | 'openai-compatible';
export const CONTRACT_SHAPES: readonly ContractShape[] = ['anthropic', 'openai-compatible'];

/** The probe route in one shape: an endpoint (Anthropic SDK, x-api-key) or an OpenCode URL (OpenAI-style, Bearer). */
export function probeRoute(shape: ContractShape, url: string): LentRoute {
    return {
        id: PROBE_ROUTE_ID, label: 'Agent Farm contract probe', engines: ['opencode'], authKind: 'api-key',
        tiers: { opus: PROBE_MODEL }, revision: 1, ...(shape === 'anthropic' ? { baseUrl: url } : { opencodeUrl: url })
    };
}

/** Where the request must land and the header that must carry the key (measured, design map section 2). */
export function expectedRequest(shape: ContractShape): { path: string; header: string; value: string } {
    return shape === 'anthropic'
        ? { path: '/v1/messages', header: 'x-api-key', value: PROBE_KEY }
        : { path: '/chat/completions', header: 'authorization', value: `Bearer ${PROBE_KEY}` };
}

/** The probe's environment: the fragment exactly as a launch writes it, the stand-in key, and no self-update. */
export function probeEnv(shape: ContractShape, url: string): Record<string, string> {
    return {
        OPENCODE_CONFIG_CONTENT: fragmentFor([probeRoute(shape, url)]) ?? '',
        [routeKeyEnvName(PROBE_ROUTE_ID)]: PROBE_KEY,
        OPENCODE_DISABLE_AUTOUPDATE: '1'
    };
}

/** The two commands, both subcommands: the catalog for the probe provider, and one read-only turn on it. */
export function probeCommands(): { models: string[]; run: string[] } {
    return {
        models: [...opencodeModelsListArgs(), wireIdOf(PROBE_ROUTE_ID)],
        run: opencodeRunArgs({ model: modelRefOf(PROBE_ROUTE_ID, PROBE_MODEL), agent: 'plan' })
    };
}

export interface ProbeRequest { method: string; path: string; headers: Record<string, string | undefined> }

export interface ShapeObservation {
    shape: ContractShape;
    /** stdout of the catalog command */
    listed: string;
    /** what reached the local server during this shape's turn */
    requests: ProbeRequest[];
    /** set when a command could not be run at all */
    error?: string;
}

export interface ShapeVerdict { shape: ContractShape; listed: boolean; reached: boolean; keyed: boolean; paths: string[] }

export interface ContractResult {
    /** the CLI version the probe ran against */
    version: string;
    at: number;
    /** broken = OpenCode ran and did not take the shape; not-run = nothing could be concluded */
    status: 'ok' | 'broken' | 'not-run';
    shapes: ShapeVerdict[];
    problems: string[];
}

const pathOnly = (p: string): string => String(p ?? '').split('?')[0];

/** One verdict for the whole probe. No header value is kept — only whether the right one arrived. */
export function readContract(version: string, at: number, seen: readonly ShapeObservation[]): ContractResult {
    const problems: string[] = [];
    const shapes: ShapeVerdict[] = [];
    let ran = 0;
    for (const shape of CONTRACT_SHAPES) {
        const o = seen.find(s => s.shape === shape);
        if (!o || o.error) {
            problems.push(`${shape}: the probe could not be run${o?.error ? ` (${o.error})` : ''}`);
            continue;
        }
        ran++;
        const want = expectedRequest(shape);
        const hit = o.requests.find(r => pathOnly(r.path) === want.path);
        const v: ShapeVerdict = {
            shape,
            listed: o.listed.split(/\r?\n/).some(l => l.trim() === modelRefOf(PROBE_ROUTE_ID, PROBE_MODEL)),
            reached: !!hit,
            keyed: !!hit && String(hit.headers[want.header] ?? '') === want.value,
            paths: [...new Set(o.requests.map(r => pathOnly(r.path)))]
        };
        shapes.push(v);
        if (!v.listed) { problems.push(`${shape}: OpenCode ${version} does not list the provider given in OPENCODE_CONFIG_CONTENT`); }
        if (!v.reached) {
            problems.push(`${shape}: no request reached ${want.path}`
                + (v.paths.length ? ` — it went to ${v.paths.join(', ')}` : ' — nothing reached the local server'));
        } else if (!v.keyed) {
            problems.push(`${shape}: the request reached ${want.path} without the key in ${want.header}`);
        }
    }
    const status = ran < CONTRACT_SHAPES.length ? 'not-run' : problems.length ? 'broken' : 'ok';
    return { version, at, status, shapes, problems };
}

/** Probed ONCE per CLI version; `providers.contract run=true` asks again by hand. */
export function contractDue(last: ContractResult | undefined, version: string): boolean {
    return !!version.trim() && (!last || last.version !== version);
}

/** The problem every lent route row carries while the probe of THIS version says the contract is broken. */
export function contractProblem(last: ContractResult | undefined, version: string): string {
    if (!last || last.status !== 'broken' || last.version !== version) { return ''; }
    return `engine contract changed: OpenCode ${version} no longer takes a lent route the way Agent Farm writes it `
        + `(${last.problems[0]}) — providers.contract has the probe's findings`;
}
