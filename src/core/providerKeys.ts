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
