import * as fs from 'fs';
import { extractJson, sanitizePrompt } from './util';
import { execOneShot } from './oneShot';

/**
 * D2 — Instruction suggestion engine. A cheap model scans the user's
 * follow-up messages in recent transcripts for repeated corrections
 * ("hayır, şöyle yap" patterns) and proposes CLAUDE.md rules. Suggestions
 * surface as Insights and are applied only with explicit approval.
 */

export interface Suggestion {
    id: string;
    agentId: string;
    agentName: string;
    /** One-sentence imperative rule, ready to append to CLAUDE.md. */
    rule: string;
    /** Which repeated messages the rule is based on. */
    evidence: string;
    createdAt: number;
    status: 'open' | 'applied' | 'dismissed';
}

const MAX_SUGGESTIONS = 200;

export class SuggestionStore {
    suggestions: Suggestion[] = [];
    lastScanAt = 0;

    constructor(private file: string) {
        this.load();
    }

    private load(): void {
        try {
            const json = JSON.parse(fs.readFileSync(this.file, 'utf8')) as {
                suggestions?: Suggestion[]; lastScanAt?: number;
            };
            this.suggestions = Array.isArray(json.suggestions) ? json.suggestions : [];
            this.lastScanAt = json.lastScanAt ?? 0;
        } catch { /* first run */ }
    }

    save(): void {
        try {
            if (this.suggestions.length > MAX_SUGGESTIONS) {
                this.suggestions = this.suggestions.slice(-MAX_SUGGESTIONS);
            }
            fs.writeFileSync(this.file, JSON.stringify({
                suggestions: this.suggestions, lastScanAt: this.lastScanAt
            }, null, 2), 'utf8');
        } catch { /* storage is best-effort */ }
    }

    open(): Suggestion[] {
        return this.suggestions.filter(s => s.status === 'open');
    }

    byId(id: string): Suggestion | undefined {
        return this.suggestions.find(s => s.id === id);
    }

    setStatus(id: string, status: Suggestion['status']): void {
        const s = this.byId(id);
        if (s) { s.status = status; this.save(); }
    }

    /** Add new suggestions, skipping near-duplicates of existing rules for the same agent. */
    addAll(list: Omit<Suggestion, 'id' | 'createdAt' | 'status'>[]): Suggestion[] {
        const added: Suggestion[] = [];
        for (const item of list) {
            const norm = item.rule.toLowerCase().replace(/\s+/g, ' ').trim();
            const dup = this.suggestions.some(s =>
                s.agentId === item.agentId &&
                s.rule.toLowerCase().replace(/\s+/g, ' ').trim() === norm);
            if (dup || !norm) { continue; }
            const s: Suggestion = {
                ...item,
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                createdAt: Date.now(),
                status: 'open'
            };
            this.suggestions.push(s);
            added.push(s);
        }
        if (added.length) { this.save(); }
        return added;
    }
}

/**
 * Collect the user's follow-up messages from transcripts. The first message
 * of each session is the task itself — corrections live in the follow-ups.
 */
export function collectUserMessages(
    files: string[],
    opts: { maxMessages?: number; maxCharsPerMsg?: number } = {}
): string[] {
    const maxMessages = opts.maxMessages ?? 80;
    const maxChars = opts.maxCharsPerMsg ?? 220;
    const out: string[] = [];
    for (const file of files) {
        let raw: string;
        try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
        let seenFirst = false;
        for (const lineText of raw.split('\n')) {
            if (!lineText.trim()) { continue; }
            let line: { type?: string; isMeta?: boolean; message?: { content?: unknown } };
            try { line = JSON.parse(lineText); } catch { continue; }
            if (line.type !== 'user' || line.isMeta) { continue; }
            const content = line.message?.content;
            if (typeof content !== 'string' || content.startsWith('<')) { continue; }
            if (!seenFirst) { seenFirst = true; continue; }
            out.push(content.replace(/\s+/g, ' ').trim().slice(0, maxChars));
            if (out.length >= maxMessages) { return out; }
        }
    }
    return out;
}

/** Cheap-model scan: repeated correction patterns → proposed CLAUDE.md rules. */
export function scanCorrections(
    cwd: string, judgeArgs: string, agentName: string, messages: string[]
): Promise<{ rules: { rule: string; evidence: string }[]; raw: string }> {
    return new Promise(resolve => {
        let joined = '';
        for (const m of messages) {
            if (joined.length + m.length > 5500) { break; }
            joined += (joined ? ' || ' : '') + m;
        }
        const p = sanitizePrompt(
            `Aşağıda kullanıcının '${agentName}' adlı yapay zekâ ajanına oturum içinde yazdığı ` +
            `TAKİP mesajları var ('||' ile ayrılmış). Kullanıcının TEKRARLAYAN düzeltme, uyarı veya ` +
            `tercih kalıplarını bul (dil, biçim, üslup, süreç). En fazla 3 öneri üret; her öneri ` +
            `ajanın CLAUDE.md dosyasına eklenebilecek tek cümlelik, emir kipinde Türkçe bir kural olsun. ` +
            `Tek seferlik istekleri kural yapma; yalnızca en az iki kez tekrarlanan kalıpları öner. ` +
            `Yalnızca şu JSON ile cevap ver: {'suggestions':[{'rule':'...','evidence':'hangi mesajlara dayandığı'}]} ` +
            `(çift tırnaklı geçerli JSON kullan). Tekrarlayan kalıp yoksa boş dizi döndür. MESAJLAR: ${joined}`);
        // X-260 — through the seam.
        void execOneShot({ cwd, args: judgeArgs, prompt: p, timeoutMs: 240_000 }).then(r => {
            const raw = r.out;
            if (r.error && !raw) {
                resolve({ rules: [], raw: 'scan unavailable (' + r.error.slice(0, 80) + ')' });
                return;
            }
            const json = extractJson(raw) as { suggestions?: { rule?: unknown; evidence?: unknown }[] } | undefined;
            const rules = (Array.isArray(json?.suggestions) ? json!.suggestions! : [])
                .filter(s => typeof s?.rule === 'string' && (s.rule as string).trim())
                .slice(0, 3)
                .map(s => ({
                    rule: String(s.rule).trim().slice(0, 300),
                    evidence: String(s.evidence ?? '').trim().slice(0, 300)
                }));
            resolve({ rules, raw });
        });
    });
}

export const LEARNED_RULES_HEADER = '## Learned rules (Agent Farm)';

/** Append an approved rule to the agent's CLAUDE.md under a dedicated section. */
export function applySuggestionToClaudeMd(claudeMdPath: string, rule: string): boolean {
    let content: string;
    try { content = fs.readFileSync(claudeMdPath, 'utf8'); } catch { return false; }
    const line = `- ${rule.trim()}`;
    if (content.includes(line)) { return true; }
    const idx = content.indexOf(LEARNED_RULES_HEADER);
    if (idx >= 0) {
        const insertAt = idx + LEARNED_RULES_HEADER.length;
        content = content.slice(0, insertAt) + `\n${line}` + content.slice(insertAt);
    } else {
        content = content.replace(/\n*$/, '\n') + `\n${LEARNED_RULES_HEADER}\n${line}\n`;
    }
    try { fs.writeFileSync(claudeMdPath, content, 'utf8'); return true; } catch { return false; }
}
