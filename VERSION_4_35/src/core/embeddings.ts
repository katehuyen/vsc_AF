/**
 * D4 (semantic layer) — embeddings provider abstraction. Two backends,
 * both plain fetch (no SDK):
 *  - 'gemini':  Google Generative Language REST API (needs GEMINI_API_KEY)
 *  - 'openai':  any OpenAI-compatible /embeddings endpoint — OpenAI itself,
 *               or a fully local model via Ollama / LM Studio (no key needed)
 */

export type EmbeddingsProvider = 'off' | 'gemini' | 'openai';

export interface EmbeddingsConfig {
    provider: EmbeddingsProvider;
    /** empty = provider default */
    model: string;
    /** empty = provider default; override for tests / local servers */
    baseUrl: string;
    /** may be empty for local endpoints (Ollama) */
    apiKey: string;
}

export const DEFAULT_EMBEDDING_MODELS: Record<'gemini' | 'openai', string> = {
    gemini: 'gemini-embedding-001',
    openai: 'text-embedding-3-small'
};

const DEFAULT_BASE_URLS: Record<'gemini' | 'openai', string> = {
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    openai: 'https://api.openai.com/v1'
};

export function resolveEmbeddings(cfg: EmbeddingsConfig): EmbeddingsConfig {
    if (cfg.provider === 'off') { return cfg; }
    return {
        ...cfg,
        model: cfg.model.trim() || DEFAULT_EMBEDDING_MODELS[cfg.provider],
        baseUrl: (cfg.baseUrl.trim() || DEFAULT_BASE_URLS[cfg.provider]).replace(/\/+$/, '')
    };
}

const BATCH = 64;

async function embedBatchGemini(texts: string[], cfg: EmbeddingsConfig): Promise<number[][]> {
    const url = `${cfg.baseUrl}/models/${cfg.model}:batchEmbedContents?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: texts.map(t => ({
                model: `models/${cfg.model}`,
                content: { parts: [{ text: t }] }
            }))
        })
    });
    if (!res.ok) {
        throw new Error(`gemini embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json() as { embeddings?: { values?: number[] }[] };
    if (!json.embeddings || json.embeddings.length !== texts.length) {
        throw new Error('gemini embeddings: unexpected response shape');
    }
    return json.embeddings.map(e => e.values ?? []);
}

async function embedBatchOpenAI(texts: string[], cfg: EmbeddingsConfig): Promise<number[][]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) { headers['Authorization'] = `Bearer ${cfg.apiKey}`; }
    const res = await fetch(`${cfg.baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: cfg.model, input: texts })
    });
    if (!res.ok) {
        throw new Error(`embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json() as { data?: { index?: number; embedding?: number[] }[] };
    if (!json.data || json.data.length !== texts.length) {
        throw new Error('embeddings: unexpected response shape');
    }
    const out: number[][] = new Array(texts.length);
    for (const [i, item] of json.data.entries()) {
        out[item.index ?? i] = item.embedding ?? [];
    }
    return out;
}

/** Embed texts in batches. Returns vectors in input order, or an error string. */
export async function embedTexts(
    texts: string[], config: EmbeddingsConfig
): Promise<{ vectors?: number[][]; error?: string }> {
    const cfg = resolveEmbeddings(config);
    if (cfg.provider === 'off') { return { error: 'embeddings provider is off — set agentFarm.embeddingsProvider' }; }
    if (cfg.provider === 'gemini' && !cfg.apiKey) {
        return { error: 'gemini embeddings need an API key — store it as a secret (default name GEMINI_API_KEY)' };
    }
    try {
        const vectors: number[][] = [];
        for (let i = 0; i < texts.length; i += BATCH) {
            const batch = texts.slice(i, i + BATCH);
            const got = cfg.provider === 'gemini'
                ? await embedBatchGemini(batch, cfg)
                : await embedBatchOpenAI(batch, cfg);
            vectors.push(...got);
        }
        if (vectors.some(v => !v.length)) { return { error: 'embeddings: empty vector in response' }; }
        return { vectors };
    } catch (e) {
        return { error: String((e as Error).message).slice(0, 300) };
    }
}
