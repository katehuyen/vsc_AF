import * as vscode from 'vscode';
import { FCM_SECRET } from './fcm';

/**
 * B2 — Secrets vault: API keys and site credentials live in VS Code
 * SecretStorage (OS keychain), never in settings files. A cached copy feeds
 * task environments and {secret:NAME} template substitution synchronously.
 *
 * B4 — each secret carries non-secret metadata (description, timestamps and an
 * optional per-agent scope) stored in globalState alongside the keyed value.
 * The scope is the "usage authorization": an empty/absent agent list means the
 * secret is injected into EVERY agent's task environment (the original, and
 * still the default, behaviour); a non-empty list restricts injection to those
 * agents only. Values never leave the keychain — the management panel reads
 * metadata, never the value.
 *
 * Note — deliberately NOT exposed through the farm bridge (core/bridge.ts):
 * the bridge is a plaintext request/response file channel, so routing secret
 * values (or even set/delete of them) through it would defeat the keychain.
 * This is the security exception to constitution §19.C, accepted by the user
 * on 2026-07-19; secrets are managed only from the in-VS-Code panel/commands.
 */

const INDEX_KEY = 'agentfarm.secretNames';
const META_KEY = 'agentfarm.secretMeta';
const PREFIX = 'agentfarm.secret.';

/** Non-secret facts about one stored secret (never the value). */
export interface SecretMeta {
    description?: string;
    /** Agent ids allowed to receive this secret. Empty/absent = all agents. */
    agents?: string[];
    /** Agent Farm reads it itself (get); no agent's task environment ever receives it, whatever `agents` says. */
    farmOnly?: boolean;
    createdAt: number;
    updatedAt: number;
}

/** One row for the management panel — metadata only, no value. */
export interface SecretInfo {
    name: string;
    description: string;
    agents: string[];
    farmOnly: boolean;
    createdAt: number;
    updatedAt: number;
}

export type SecretMetaPatch = { description?: string; agents?: string[]; farmOnly?: boolean };

/** Secrets only Agent Farm itself uses: a new one starts farm-only (secretsPanel.ts), an older one whose scope was never chosen is moved there once. */
export const FARM_ONLY_ADOPT = ['TYPESAFE_API_KEY', FCM_SECRET];

export class SecretsVault {
    private cache = new Map<string, string>();

    constructor(
        private storage: vscode.SecretStorage,
        private state: vscode.Memento
    ) {}

    /** Load all known secrets into the in-memory cache (activation + after changes). */
    async refresh(): Promise<void> {
        this.cache.clear();
        for (const name of this.names()) {
            const value = await this.storage.get(PREFIX + name);
            if (value !== undefined) { this.cache.set(name, value); }
        }
    }

    names(): string[] {
        return this.state.get<string[]>(INDEX_KEY, []);
    }

    private allMeta(): Record<string, SecretMeta> {
        return this.state.get<Record<string, SecretMeta>>(META_KEY, {});
    }

    /** Store (or replace) a secret's value; `patch` optionally sets its
     *  description/agent-scope in the same call. createdAt is preserved across
     *  value replacements; updatedAt always advances. */
    async set(name: string, value: string, patch?: SecretMetaPatch): Promise<void> {
        await this.storage.store(PREFIX + name, value);
        const names = new Set(this.names());
        names.add(name);
        await this.state.update(INDEX_KEY, [...names].sort());
        await this.writeMeta(name, patch);
        this.cache.set(name, value);
    }

    /** Edit a secret's metadata (description / agent-scope) without touching its
     *  value. A no-op if the name is unknown. */
    async setMeta(name: string, patch: SecretMetaPatch): Promise<void> {
        if (!this.names().includes(name)) { return; }
        await this.writeMeta(name, patch);
    }

    /** Each named secret whose farm-only choice was never made (neither true nor false) becomes farm-only; the names moved. */
    async adoptFarmOnly(names: string[]): Promise<string[]> {
        const meta = this.allMeta();
        const moved = names.filter(n => this.names().includes(n) && meta[n]?.farmOnly === undefined);
        for (const n of moved) { await this.writeMeta(n, { farmOnly: true }); }
        return moved;
    }

    private async writeMeta(name: string, patch?: SecretMetaPatch): Promise<void> {
        const all = this.allMeta();
        const prev = all[name];
        const now = Date.now();
        const farmOnly = patch?.farmOnly !== undefined ? patch.farmOnly : prev?.farmOnly;
        const next: SecretMeta = {
            description: patch?.description !== undefined ? patch.description : prev?.description,
            agents: patch?.agents !== undefined ? patch.agents : prev?.agents,
            ...(farmOnly !== undefined ? { farmOnly } : {}),
            createdAt: prev?.createdAt ?? now,
            updatedAt: now
        };
        all[name] = next;
        await this.state.update(META_KEY, all);
    }

    /**
     * X-487 — a secret under a new name: value, description, scope and createdAt go with it.
     * The new key is written before the old one is removed, so a failure half way never loses the value.
     */
    async rename(from: string, to: string): Promise<boolean> {
        if (from === to || !this.names().includes(from) || this.names().includes(to)) { return false; }
        const value = this.cache.get(from) ?? await this.storage.get(PREFIX + from);
        if (value === undefined) { return false; }
        await this.storage.store(PREFIX + to, value);
        const all = this.allMeta();
        if (all[from]) { all[to] = { ...all[from], updatedAt: Date.now() }; delete all[from]; }
        await this.state.update(META_KEY, all);
        await this.state.update(INDEX_KEY, [...this.names().filter(n => n !== from), to].sort());
        await this.storage.delete(PREFIX + from);
        this.cache.delete(from);
        this.cache.set(to, value);
        return true;
    }

    async delete(name: string): Promise<void> {
        await this.storage.delete(PREFIX + name);
        await this.state.update(INDEX_KEY, this.names().filter(n => n !== name));
        const all = this.allMeta();
        if (all[name]) { delete all[name]; await this.state.update(META_KEY, all); }
        this.cache.delete(name);
    }

    /** Every secret as a panel row (metadata only), sorted by name. */
    list(): SecretInfo[] {
        const meta = this.allMeta();
        return this.names().sort().map(name => {
            const m = meta[name];
            return {
                name,
                description: m?.description ?? '',
                agents: m?.agents ?? [],
                farmOnly: m?.farmOnly === true,
                createdAt: m?.createdAt ?? 0,
                updatedAt: m?.updatedAt ?? 0
            };
        });
    }

    /** Synchronous lookup from cache (for command-time template substitution). */
    get(name: string): string | undefined {
        return this.cache.get(name);
    }

    /** True when `agentId` is allowed to receive `name` (unrestricted = all). */
    private allowed(name: string, agentId: string | undefined, meta: Record<string, SecretMeta>): boolean {
        if (meta[name]?.farmOnly === true) { return false; }
        const scope = meta[name]?.agents;
        if (!scope || scope.length === 0) { return true; }   // unrestricted → every agent
        return agentId !== undefined && scope.includes(agentId);
    }

    /** Secrets as environment variables for a spawned task. When `agentId` is
     *  given, agent-scoped secrets are filtered to that agent; with no agent
     *  context, scoped secrets are withheld (never leak to an unknown env). */
    env(agentId?: string): Record<string, string> {
        const meta = this.allMeta();
        const out: Record<string, string> = {};
        for (const [k, v] of this.cache) {
            if (this.allowed(k, agentId, meta)) { out[k] = v; }
        }
        return out;
    }

    /** Replace {secret:NAME} placeholders; unknown names resolve to empty. */
    substitute(template: string): string {
        return template.replace(/\{secret:([\w.-]+)\}/g, (_m, name: string) => this.get(name) ?? '');
    }
}

/** Conservative plaintext-credential sniff for config files (health rule). */
export function looksLikePlaintextSecret(content: string): string | undefined {
    const patterns = [
        /"(?:api[_-]?key|apikey|token|secret|password)"\s*:\s*"([^"]{16,})"/i,
        /\b(sk-[A-Za-z0-9_-]{20,})\b/,
        /\b(key-[A-Za-z0-9]{24,})\b/
    ];
    for (const re of patterns) {
        const m = re.exec(content);
        if (m) {
            const value = m[1] ?? m[0];
            // Ignore obvious placeholders.
            if (/\$\{|\{secret:|YOUR_|XXXX|<.*>/i.test(value)) { continue; }
            return value.slice(0, 6) + '…';
        }
    }
    return undefined;
}
