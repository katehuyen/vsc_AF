/**
 * X-494 — HOW A ROUTE'S KEY IS SENT, in the words a person reads.
 *
 * The stored values stay the wire's own: `oauth` is what `providerRuntime`
 * turns into ANTHROPIC_AUTH_TOKEN (an `Authorization: Bearer` header), and
 * anything else into ANTHROPIC_API_KEY. Renaming the stored value would strand
 * every route already written by hand or by an agent; only what is DRAWN reads
 * as the header it becomes.
 */
export interface RouteAuthKind {
    id: string;
    label: string;
    detail: string;
}

export const ROUTE_AUTH_KINDS: readonly RouteAuthKind[] = [
    {
        id: 'api-key', label: 'API key',
        detail: 'Sent as the x-api-key header — what Anthropic and the shipped Anthropic-compatible routes take.'
    },
    {
        id: 'oauth', label: 'Bearer token',
        detail: 'Sent as an Authorization: Bearer header — what OpenRouter and most gateways take.'
    }
];

/** A kind this build has words for reads as them; any other is shown as written. */
export function authKindLabel(kind: string | undefined): string {
    const k = String(kind ?? '').trim();
    return ROUTE_AUTH_KINDS.find(a => a.id === k)?.label ?? k;
}
