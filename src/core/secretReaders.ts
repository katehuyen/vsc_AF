/**
 * X-487 — WHO READS A FARM SECRET BY ITS NAME.
 *
 * A secret's name is three things at once: the environment variable an agent's
 * task receives, the `{secret:NAME}` a prompt writes, and — for some — the name
 * Agent Farm itself looks a key up by. Renaming or deleting one is safe only
 * when the person doing it can see the third list, so the Secrets page asks
 * this before either.
 *
 * Pure: the names come in from where they are actually defined (the settings,
 * the Kapıcı candidates, each engine's own env name, the Telegram constant), so
 * nothing here is a copy that can drift from the code that reads them.
 */

export interface SecretReaderSources {
    /** The vault name the phone bridge reads its bot token from. */
    telegram: string;
    /** The vault name the phone wake reads its Firebase service account key from. */
    wake?: string;
    /** agentFarm.kapici.keyName, else every candidate Kapıcı tries in turn. */
    kapici: string[];
    /** The embeddings key name — only while embeddings are on. */
    embeddings?: string;
    /** agentFarm.mediaAuthSecret and agentFarm.replicateAuthSecret. */
    media: string;
    replicate: string;
    /** Each engine whose CLI signs in from an environment variable of this name. */
    engines: { label: string; env: string }[];
}

/** The places Agent Farm reads `name` from the vault, in words a person recognises. */
export function secretReaders(name: string, s: SecretReaderSources): string[] {
    const out: string[] = [];
    if (!name) { return out; }
    if (name === s.telegram) { out.push('the phone bridge (Telegram bot token)'); }
    if (s.wake && name === s.wake) { out.push('the phone wake (Firebase service account key)'); }
    if (s.kapici.includes(name)) { out.push('Gatekeeper, the decision gate'); }
    if (s.embeddings && name === s.embeddings) { out.push('search embeddings (agentFarm.embeddingsSecret)'); }
    if (name === s.media) { out.push('media generation (agentFarm.mediaAuthSecret)'); }
    if (name === s.replicate) { out.push('Replicate media (agentFarm.replicateAuthSecret)'); }
    for (const e of s.engines) {
        if (e.env && name === e.env) { out.push(`${e.label} signs in with it`); }
    }
    return out;
}
