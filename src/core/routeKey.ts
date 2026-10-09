/**
 * X-488 / X-492 — WHICH KEY A ROUTE SIGNS IN WITH, read off its bind.
 *
 * A route signs in with a key of its own or with a Farm Secret it names, and
 * only at the endpoint a person gave that key for (`KeyBind`, kept by
 * `ProviderKeys`). Pure: the bind, the route's own key and the vault come in.
 */
import { KeyBind } from './providerKeys';

export interface RouteKey {
    /** ‼️ PRIVATE — goes to the spawn's environment and nowhere else. */
    value?: string;
    from: 'route' | 'secret' | 'none';
    secretRef?: string;
    /** The endpoint the key was given for, when the route has moved since: no key until a person confirms. */
    heldFor?: string;
}

/**
 * ‼️ A KEY NEVER FOLLOWS ITS ROUTE TO A NEW HOST, and a named Farm Secret that
 * is gone is no key — never a quiet fall back to another one.
 */
export function routeKeyFor(
    p: { id: string; baseUrl?: string; opencodeUrl?: string },
    bind: KeyBind | undefined,
    own: (id: string) => string | undefined,
    named: (name: string) => string | undefined
): RouteKey {
    if (!bind) { return { from: 'none' }; }
    const from = bind.secretRef ? 'secret' : 'route';
    const ref = bind.secretRef ? { secretRef: bind.secretRef } : {};
    // X-516 — the OpenCode endpoint is a second address the key would go to: it moves the key's bind the same way
    if ((bind.baseUrl ?? '') !== (p.baseUrl ?? '') || (bind.opencodeUrl ?? '') !== (p.opencodeUrl ?? '')) {
        const at = bind.baseUrl || 'the first-party endpoint';
        return { from, ...ref, heldFor: bind.opencodeUrl ? `${at} and ${bind.opencodeUrl}` : at };
    }
    const v = bind.secretRef ? named(bind.secretRef) : own(p.id);
    return { from, ...ref, ...(v ? { value: v } : {}) };
}

/** `sk-or-v1-…abcd` → `sk-or-…abcd`: enough to tell two keys apart, never enough to use one. */
export function keyHint(value?: string): string {
    const v = (value ?? '').trim();
    if (!v) { return ''; }
    return v.length < 16 ? `…${v.slice(-2)}` : `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export interface KeyPick {
    action: 'type' | 'secret' | 'confirm' | 'remove';
    name?: string;
    label: string;
    description?: string;
    detail?: string;
}

/** Who else receives a Farm Secret as a variable, in the words the picker shows. */
function reachOf(s: { agents: string[]; farmOnly: boolean }): string {
    if (s.farmOnly) { return 'Farm-only: no agent task receives it as a variable'; }
    return s.agents.length
        ? `Given as a variable to ${s.agents.length} agent${s.agents.length === 1 ? '' : 's'}`
        : 'Given as a variable to every agent';
}

/** The choices behind a route's key button, in the order a person reads them. */
export function keyPickItems(
    key: RouteKey,
    secrets: { name: string; description: string; agents: string[]; farmOnly: boolean }[],
    canConfirm: boolean
): KeyPick[] {
    const out: KeyPick[] = [];
    if (key.heldFor && canConfirm) {
        out.push({
            action: 'confirm', label: '$(check) Use the stored key at this endpoint',
            detail: `It was given for ${key.heldFor}; the route's endpoint has changed since.`
        });
    }
    out.push({
        action: 'type', label: '$(key) Type a key for this route',
        detail: 'Kept in the OS keychain under this route alone; removing the route removes it.'
    });
    for (const s of secrets) {
        const inUse = key.secretRef === s.name;
        out.push({
            action: 'secret', name: s.name, label: `$(lock) ${s.name}`,
            ...(s.description || inUse
                ? { description: [inUse ? 'in use' : '', s.description].filter(Boolean).join(' · ') } : {}),
            detail: `Farm Secret · ${reachOf(s)}. Removing the route leaves it in the vault.`
        });
    }
    if (key.from !== 'none') {
        out.push({
            action: 'remove', label: '$(trash) Remove the key',
            detail: key.secretRef
                ? `Stops using the Farm Secret ${key.secretRef}; the secret itself stays in the vault.`
                : 'Deletes this route\'s own key from the OS keychain.'
        });
    }
    return out;
}
