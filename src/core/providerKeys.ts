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
 * ‼️ X-488 / X-492 — AND IT OWNS WHICH ENDPOINT THE KEY WAS GIVEN FOR. A route
 * signs in with a key of its own or with a Farm Secret it names, and either one
 * is BOUND to the base URL a person gave it for. The bind lives here, beside the
 * keychain, never in the settings file: settings are written by hand, by
 * `settings.set` and by `providers.set`, and a key that followed any of those to
 * a new host would go where nobody chose to send it. A moved route has no key
 * until a person confirms it in the Engines page (`routeKey.ts` reads the bind).
 *
 * The cache exists because a launch resolves its environment synchronously; it
 * is filled before activation goes on (as the vault's is) and kept in step by
 * every write here. Pure: the keychain and the state store come in.
 */
import { secretKeyFor } from './providerOwnership';

/** The index of profile ids that have a stored key: `hasSecret` is derived from it, never stored. */
export const PROVIDER_SECRET_IDS = 'agentfarm.providerSecretIds';
/** profile id → the endpoint its key was given for, and the Farm Secret it names (if any). */
export const PROVIDER_KEY_BINDS = 'agentfarm.providerKeyBinds';

export interface KeyBind {
    /** The route's base URL when a person gave it this key; '' = the first-party endpoint. */
    baseUrl: string;
    /** A Farm Secret's NAME, when the route signs in with one instead of a key of its own. */
    secretRef?: string;
}

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

    /** A key of the route's own, given for the endpoint it has now; a Farm Secret it named is let go. */
    async set(id: string, value: string, baseUrl: string): Promise<void> {
        const key = secretKeyFor(id);
        if (!key) { return; }
        await this.keychain.store(key, value);
        this.cache.set(id, value);
        await this.state.update(PROVIDER_SECRET_IDS, [...new Set([...this.ids(), id])].sort());
        await this.bind(id, { baseUrl });
    }

    /** No key at all: its own is collected and the bind goes (a named Farm Secret stays in the vault). */
    async delete(id: string): Promise<void> {
        const key = secretKeyFor(id);
        if (!key) { return; }
        await this.keychain.delete(key);
        this.cache.delete(id);
        await this.state.update(PROVIDER_SECRET_IDS, this.ids().filter(x => x !== id));
        await this.bind(id, undefined);
    }

    binds(): Record<string, KeyBind> {
        return { ...this.state.get<Record<string, KeyBind>>(PROVIDER_KEY_BINDS, {}) };
    }

    bindOf(id: string): KeyBind | undefined { return this.binds()[id]; }

    async bind(id: string, b: KeyBind | undefined): Promise<void> {
        const all = this.binds();
        if (b) { all[id] = b.secretRef ? { baseUrl: b.baseUrl, secretRef: b.secretRef } : { baseUrl: b.baseUrl }; } else { delete all[id]; }
        await this.state.update(PROVIDER_KEY_BINDS, all);
    }

    /**
     * A key stored before binds existed is bound to the endpoint its route has at the first start
     * that knows about binds — the only endpoint it can be said to have been given for. Returns the ids.
     */
    async adopt(routes: { id: string; baseUrl?: string }[]): Promise<string[]> {
        const all = this.binds();
        const adopted = this.ids().filter(id => !all[id] && routes.some(r => r.id === id));
        for (const id of adopted) { all[id] = { baseUrl: routes.find(r => r.id === id)?.baseUrl ?? '' }; }
        if (adopted.length) { await this.state.update(PROVIDER_KEY_BINDS, all); }
        return adopted;
    }
}
