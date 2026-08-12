import { totalTokens, Usage } from './pricing';

/**
 * J3 — OpenTelemetry export. Sessions (and their subagent trees) become
 * OTLP/JSON trace spans that Langfuse / Grafana Tempo / any OTLP-JSON
 * consumer can ingest. Locality is preserved: this only writes a file —
 * the user decides where (and whether) to send it.
 */

interface OtlpAttr {
    key: string;
    value: { stringValue?: string; doubleValue?: number; intValue?: string };
}

interface OtlpSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    kind: number;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes: OtlpAttr[];
    status: { code: number };
}

export interface OtelSessionRef {
    sessionId: string;
    parentSessionId?: string;
    title: string;
    agentName?: string;
    firstTs: number;
    lastTs: number;
    cost: number;
    usage: Usage;
    models: string[];
    toolCalls: number;
    errors: number;
    machine?: string;
    /** External CLI id (codex/gemini/agy) — absent means Claude. See gen_ai.system. */
    source?: string;
}

/** Deterministic hex id from a string (OTLP: traceId 32 hex, spanId 16 hex). */
export function hexId(seed: string, chars: 16 | 32): string {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < seed.length; i++) {
        h1 = ((h1 ^ seed.charCodeAt(i)) * 0x01000193) >>> 0;
        h2 = ((h2 + seed.charCodeAt(i)) * 0x0100019f) >>> 0;
    }
    let out = '';
    let a = h1, b = h2;
    while (out.length < chars) {
        a = (a * 1664525 + 1013904223) >>> 0;
        b = (b ^ a) >>> 0;
        out += a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
    }
    return out.slice(0, chars);
}

function attr(key: string, value: string | number): OtlpAttr {
    return typeof value === 'number'
        ? { key, value: { doubleValue: value } }
        : { key, value: { stringValue: value } };
}

function nano(ms: number): string {
    return String(Math.max(0, Math.round(ms))) + '000000';
}

/**
 * Build an OTLP/JSON document. Subagent sessions become child spans of their
 * parent (same traceId); root sessions each start their own trace.
 */
export function buildOtlpTraces(sessions: OtelSessionRef[]): unknown {
    const byId = new Map(sessions.map(s => [s.sessionId, s]));
    const rootOf = (s: OtelSessionRef, depth = 0): OtelSessionRef => {
        if (!s.parentSessionId || depth >= 5) { return s; }
        const parent = byId.get(s.parentSessionId);
        return parent ? rootOf(parent, depth + 1) : s;
    };
    const spans: OtlpSpan[] = sessions.map(s => {
        const root = rootOf(s);
        const parent = s.parentSessionId ? byId.get(s.parentSessionId) : undefined;
        return {
            traceId: hexId(root.sessionId, 32),
            spanId: hexId(s.sessionId, 16),
            parentSpanId: parent ? hexId(parent.sessionId, 16) : undefined,
            name: s.title || s.sessionId,
            kind: 1, // SPAN_KIND_INTERNAL
            startTimeUnixNano: nano(s.firstTs || s.lastTs),
            endTimeUnixNano: nano(s.lastTs || s.firstTs),
            attributes: [
                attr('agent.name', s.agentName ?? 'unknown'),
                attr('session.id', s.sessionId),
                attr('gen_ai.usage.input_tokens', s.usage.input),
                attr('gen_ai.usage.output_tokens', s.usage.output),
                attr('gen_ai.usage.total_tokens', totalTokens(s.usage)),
                attr('gen_ai.request.model', s.models.join(',')),
                /**
                 * ‼️ WHICH SYSTEM SERVED IT (X-35). `gen_ai.system` is the
                 * OpenTelemetry GenAI convention's own attribute for exactly
                 * this, and without it every span in the exported file looked
                 * like the same provider: a Codex trace and a Claude trace were
                 * distinguishable only by guessing from the model string, which
                 * is not something a dashboard can group by. Absent `source`
                 * means Claude — the same absence every other surface reads.
                 */
                attr('gen_ai.system', s.source ?? 'claude'),
                attr('cost.usd', s.cost),
                attr('tool.calls', s.toolCalls),
                attr('error.count', s.errors),
                ...(s.machine ? [attr('host.label', s.machine)] : []),
                ...(s.parentSessionId ? [attr('agent.subagent', 'true')] : [])
            ],
            status: { code: s.errors > 0 ? 2 : 1 } // ERROR : OK
        };
    });
    return {
        resourceSpans: [{
            resource: {
                attributes: [
                    attr('service.name', 'agent-farm'),
                    attr('telemetry.sdk.name', 'agent-farm-export')
                ]
            },
            scopeSpans: [{
                scope: { name: 'agent-farm', version: '1' },
                spans
            }]
        }]
    };
}
