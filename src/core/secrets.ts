import * as vscode from 'vscode';

/**
 * B2 — Secrets vault: API keys live in VS Code SecretStorage (OS keychain),
 * never in settings files. A cached copy feeds task environments and
 * {secret:NAME} template substitution synchronously.
 */

const INDEX_KEY = 'agentfarm.secretNames';
const PREFIX = 'agentfarm.secret.';

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

    async set(name: string, value: string): Promise<void> {
        await this.storage.store(PREFIX + name, value);
        const names = new Set(this.names());
        names.add(name);
        await this.state.update(INDEX_KEY, [...names].sort());
        this.cache.set(name, value);
    }

    async delete(name: string): Promise<void> {
        await this.storage.delete(PREFIX + name);
        await this.state.update(INDEX_KEY, this.names().filter(n => n !== name));
        this.cache.delete(name);
    }

    /** Synchronous lookup from cache (for command-time template substitution). */
    get(name: string): string | undefined {
        return this.cache.get(name);
    }

    /** All secrets as environment variables for spawned tasks. */
    env(): Record<string, string> {
        const out: Record<string, string> = {};
        for (const [k, v] of this.cache) { out[k] = v; }
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
