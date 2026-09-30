/**
 * The shell ↔ host contract, read from its one source: remote-contract.v1.json.
 *
 * The Android shell carries a versioned COPY of that file and derives its own
 * models from it, so the JSON — not this module and not the Kotlin — is what
 * both sides are measured against. This module only reads it: it validates a
 * frame or an event against the declared fields, and builds / parses the two
 * strings both sides must spell identically (the pairing URI and the text a
 * device signs).
 *
 * Pure: no vscode, no fs, no network.
 */
import raw from './remote-contract.v1.json';

export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

interface FieldSpec { type: FieldType; optional: boolean }
interface Shape { fields: Record<string, string>; example?: Record<string, unknown>; from?: string }

interface ContractFile {
    contract: string;
    version: number;
    scopes: string[];
    features: string[];
    pairing: { uriFields: Record<string, string>; request: Shape; response: Shape };
    frames: Record<string, Shape>;
    events: Record<string, Shape>;
}

const C = raw as unknown as ContractFile;

export const CONTRACT_NAME: string = C.contract;
export const CONTRACT_VERSION: number = C.version;
export const SCOPES: readonly string[] = C.scopes;
export const FEATURES: readonly string[] = C.features;

export function frameKinds(): string[] { return Object.keys(C.frames); }
export function eventTypes(): string[] { return Object.keys(C.events); }
/** Who may send a frame kind: 'host' | 'client' | 'either'. */
export function frameSender(kind: string): string | undefined { return C.frames[kind]?.from; }
export function frameExample(kind: string): Record<string, unknown> | undefined { return C.frames[kind]?.example; }
export function eventExample(type: string): Record<string, unknown> | undefined { return C.events[type]?.example; }
export function pairingShapes(): { request: Shape; response: Shape } {
    return { request: C.pairing.request, response: C.pairing.response };
}

function parseType(spec: string): FieldSpec {
    const optional = spec.endsWith('?');
    return { type: (optional ? spec.slice(0, -1) : spec) as FieldType, optional };
}

function typeOk(value: unknown, type: FieldType): boolean {
    switch (type) {
        case 'any': return true;
        case 'array': return Array.isArray(value);
        case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
        default: return typeof value === type;
    }
}

export type Check = { ok: true } | { ok: false; error: string };

/** Checks `obj` against a declared field list. Extra fields are allowed — a newer peer may send more. */
export function checkFields(obj: unknown, fields: Record<string, string>, what: string): Check {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        return { ok: false, error: `${what}: not an object` };
    }
    const rec = obj as Record<string, unknown>;
    for (const [name, spec] of Object.entries(fields)) {
        const f = parseType(spec);
        const v = rec[name];
        if (v === undefined || v === null) {
            if (!f.optional) { return { ok: false, error: `${what}: missing ${name}` }; }
            continue;
        }
        if (!typeOk(v, f.type)) { return { ok: false, error: `${what}: ${name} is not ${f.type}` }; }
    }
    return { ok: true };
}

/** A socket frame: its kind must be declared and its fields present. */
export function checkFrame(frame: unknown): Check {
    const kind = (frame as { kind?: unknown } | null)?.kind;
    if (typeof kind !== 'string') { return { ok: false, error: 'frame: missing kind' }; }
    const shape = C.frames[kind];
    if (!shape) { return { ok: false, error: `frame: unknown kind ${kind}` }; }
    const base = checkFields(frame, shape.fields, kind);
    if (!base.ok || kind !== 'event') { return base; }
    const e = frame as { type: string; data: unknown };
    const ev = C.events[e.type];
    // An unknown event type is not an error: a client ignores what it does not know.
    return ev ? checkFields(e.data, ev.fields, `event ${e.type}`) : { ok: true };
}

export function checkPairRequest(body: unknown): Check {
    return checkFields(body, C.pairing.request.fields, 'pair.request');
}

/** The exact text a device signs to answer a challenge. Both sides build it here or from the JSON's rule. */
export function signedText(farmId: string, deviceId: string, nonce: string): string {
    return `agentfarm.remote/${CONTRACT_VERSION}|${farmId}|${deviceId}|${nonce}`;
}

export interface PairingInfo {
    v: number;
    farm: string;
    name: string;
    code: string;
    /** SHA-256 of the host certificate, lowercase hex */
    fp: string;
    /** host:port candidates, most local first */
    addresses: string[];
}

export function pairingUri(p: PairingInfo): string {
    const q = new URLSearchParams({
        v: String(p.v), farm: p.farm, name: p.name, code: p.code, fp: p.fp, a: p.addresses.join(',')
    });
    return `agentfarm://pair?${q.toString()}`;
}

/** Parses a pairing URI; undefined when it is not one or a declared field is missing. */
export function parsePairingUri(uri: string): PairingInfo | undefined {
    const m = /^agentfarm:\/\/pair\?(.*)$/.exec(String(uri || '').trim());
    if (!m) { return undefined; }
    const q = new URLSearchParams(m[1]);
    for (const name of Object.keys(C.pairing.uriFields)) {
        if (!q.get(name)) { return undefined; }
    }
    const v = Number(q.get('v'));
    if (!Number.isFinite(v)) { return undefined; }
    return {
        v,
        farm: q.get('farm') as string,
        name: q.get('name') as string,
        code: q.get('code') as string,
        fp: (q.get('fp') as string).toLowerCase(),
        addresses: (q.get('a') as string).split(',').map(s => s.trim()).filter(Boolean)
    };
}
