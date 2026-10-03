/**
 * X-491 — A ROUTE'S KEY, KEPT WHERE IT IS WRITTEN AND READ FROM THERE.
 *
 * X-100 put a route's credential in the OS keychain under `secretKeyFor(id)`
 * and deliberately NOT in the Farm Secrets vault. The launch path then read it
 * back from that vault's cache, which only ever holds `agentfarm.secret.<name>`
 * entries — so every route ran with no key at all ("401 Missing Authentication
 * header") while every surface said the route had one (`hasSecret` read the id
 * index, which was right). One owner now writes, indexes, caches and reads.
 *
 * The cache exists because a launch resolves its environment synchronously; it
 * is filled before activation goes on (as the vault's is) and kept in step by
 * every write here. Pure: the keychain and the state store come in.
 */
import { secretKeyFor } from './providerOwnership';

/** The index of profile ids that have a stored key: `hasSecret` is derived from it, never stored. */
export const PROVIDER_SECRET_IDS = 'agentfarm.providerSecretIds';

export interface KeyStore {
    get(key: string): Thenable<string | undefined>;
    store(key: string, value: string): Thenable<void>;
    delete(key: string): Thenable<void>;
}
export interface IdIndex {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): Thenable<void>;
}

export class ProviderKeys {
    private readonly cache = new Map<string, string>();

    constructor(private readonly keychain: KeyStore, private readonly state: IdIndex) { }

    ids(): string[] { return this.state.get<string[]>(PROVIDER_SECRET_IDS, []); }

    has(id: string): boolean { return this.ids().includes(id); }

    /** Every indexed key into memory; an index entry whose key is gone is not a key. */
    async load(): Promise<void> {
        this.cache.clear();
        for (const id of this.ids()) {
            const key = secretKeyFor(id);
            const value = key ? await this.keychain.get(key) : undefined;
            if (value) { this.cache.set(id, value); }
        }
    }

    /** The key a launch of this route signs in with; never drawn, never logged. */
    get(id: string): string | undefined { return this.cache.get(id); }

    async set(id: string, value: string): Promise<void> {
        const key = secretKeyFor(id);
        if (!key) { return; }
        await this.keychain.store(key, value);
        this.cache.set(id, value);
        await this.state.update(PROVIDER_SECRET_IDS, [...new Set([...this.ids(), id])].sort());
    }

    async delete(id: string): Promise<void> {
        const key = secretKeyFor(id);
        if (!key) { return; }
        await this.keychain.delete(key);
        this.cache.delete(id);
        await this.state.update(PROVIDER_SECRET_IDS, this.ids().filter(x => x !== id));
    }
}

/* ===== X-488 — a route signs in with its own key OR a Farm Secret it names ===== */

export interface RouteKey {
    /** ‼️ PRIVATE — goes to the spawn's environment and nowhere else. */
    value?: string;
    from: 'route' | 'secret';
    secretRef?: string;
}

/** A named Farm Secret wins; one that is gone is no key, never a fall back to another. */
export function routeKeyFor(
    p: { id: string; secretRef?: string },
    own: (id: string) => string | undefined,
    named: (name: string) => string | undefined
): RouteKey {
    if (p.secretRef) {
        const v = named(p.secretRef);
        return { from: 'secret', secretRef: p.secretRef, ...(v ? { value: v } : {}) };
    }
    const v = own(p.id);
    return { from: 'route', ...(v ? { value: v } : {}) };
}

/** `sk-or-v1-…abcd` → `sk-or-…abcd`: enough to tell two keys apart, never enough to use one. */
export function keyHint(value?: string): string {
    const v = (value ?? '').trim();
    if (!v) { return ''; }
    return v.length < 16 ? `…${v.slice(-2)}` : `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export interface KeyPick {
    action: 'type' | 'secret' | 'remove';
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
    route: { secretRef?: string },
    secrets: { name: string; description: string; agents: string[]; farmOnly: boolean }[],
    hasKey: boolean
): KeyPick[] {
    const out: KeyPick[] = [{
        action: 'type', label: '$(key) Type a key for this route',
        detail: 'Kept in the OS keychain under this route alone; removing the route removes it.'
    }];
    for (const s of secrets) {
        const inUse = route.secretRef === s.name;
        out.push({
            action: 'secret', name: s.name, label: `$(lock) ${s.name}`,
            ...(s.description || inUse
                ? { description: [inUse ? 'in use' : '', s.description].filter(Boolean).join(' · ') } : {}),
            detail: `Farm Secret · ${reachOf(s)}. Removing the route leaves it in the vault.`
        });
    }
    if (hasKey) {
        out.push({
            action: 'remove', label: '$(trash) Remove the key',
            detail: route.secretRef
                ? `Stops using the Farm Secret ${route.secretRef}; the secret itself stays in the vault.`
                : 'Deletes this route\'s own key from the OS keychain.'
        });
    }
    return out;
}
