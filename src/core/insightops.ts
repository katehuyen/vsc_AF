// Agent Farm — insight operations (Z-wave follow-up: make Insights actionable).
// Insights used to be a read-only list: click → guide, and rows lingered
// forever. This module gives every insight a lifecycle:
//   • dismiss  — hide it for a day / a week / forever (persisted, honest count)
//   • fix      — categories with existing mechanical machinery map to the
//                one command that fixes them (no new magic, just wiring)
//   • delegate — one click builds a well-formed Turkish work order and queues
//                it as a headless task for an agent (single, selected or all)
//   • auto     — opt-in: chosen categories are delegated automatically when
//                they first appear, with a per-problem cooldown
// Pure node (no vscode import) — the host wires commands around it.

export interface InsightLite {
    severity: 'error' | 'warning' | 'info';
    agentId?: string;
    agentName: string;
    category: string;
    message: string;
    filePath?: string;
    guideAnchor: string;
    suggestionId?: string;
}

/**
 * Semi-stable identity for dismiss/auto-delegate bookkeeping. Messages carry
 * volatile numbers ("4.2× of normal", "$1.23"), so identity is anchored on
 * agent + category + file instead — "the same problem", not "the same text".
 */
export function insightKey(ins: InsightLite): string {
    return `${ins.agentId ?? '*'}|${ins.category}|${ins.filePath ?? ins.suggestionId ?? ins.guideAnchor}`;
}

export interface DismissEntry {
    /** Epoch ms the dismissal expires; 0 = forever. */
    until: number;
    /** Human label for the restore picker. */
    label: string;
}

export interface DismissFilterResult<T extends InsightLite> {
    visible: T[];
    dismissedCount: number;
    /** Keys whose dismissal expired — the host should prune them from storage. */
    expiredKeys: string[];
}

export function filterDismissed<T extends InsightLite>(
    insights: T[],
    dismissed: Record<string, DismissEntry>,
    now: number
): DismissFilterResult<T> {
    const visible: T[] = [];
    let dismissedCount = 0;
    const expiredKeys: string[] = [];
    const seenExpired = new Set<string>();
    for (const ins of insights) {
        const key = insightKey(ins);
        const entry = dismissed[key];
        if (entry && (entry.until === 0 || entry.until > now)) {
            dismissedCount++;
        } else {
            if (entry && !seenExpired.has(key)) { seenExpired.add(key); expiredKeys.push(key); }
            visible.push(ins);
        }
    }
    return { visible, dismissedCount, expiredKeys };
}

/**
 * Categories with an existing deterministic fix flow — the Fix action simply
 * invokes that command (agent-scoped where the command expects one).
 */
export const FIX_COMMANDS: Record<string, { command: string; label: string; agentScoped: boolean }> = {
    'memory-index': { command: 'agentfarm.fixMemoryIndex', label: 'Fix memory index', agentScoped: true },
    'duplicate-memory': { command: 'agentfarm.syncMemory', label: 'Merge duplicates', agentScoped: false },
    'stale-memory': { command: 'agentfarm.distillMemory', label: 'Distill memory', agentScoped: true },
    'large-memory': { command: 'agentfarm.distillMemory', label: 'Distill memory', agentScoped: true },
    'antigravity': { command: 'agentfarm.syncAntigravity', label: 'Sync now', agentScoped: true },
    'secrets': { command: 'agentfarm.setSecret', label: 'Move key to vault', agentScoped: false },
    'pulse': { command: 'agentfarm.runPulseNow', label: 'Re-run pulse', agentScoped: false }
};

/** One Turkish work order per delegation — single insight or a batch. */
export function buildDelegationPrompt(insights: InsightLite[], guideNote?: string): string {
    const lines: string[] = [];
    lines.push('Agent Farm panelinin sağlık taraması aşağıdaki bulguları raporladı. '
        + 'Görevin: her bulgunun kök nedenini kendi klasöründeki dosyalara bakarak anlamak, '
        + 'GÜVENLE düzeltebileceğini düzeltmek ve ne yaptığını raporlamak.');
    lines.push('');
    insights.forEach((ins, i) => {
        lines.push(`${i + 1}. [${ins.severity.toUpperCase()} · ${ins.category}] ${ins.message}`);
        lines.push(`   Ajan: ${ins.agentName}${ins.filePath ? `\n   İlgili dosya: ${ins.filePath}` : ''}`);
    });
    lines.push('');
    lines.push('Kurallar:');
    lines.push('- Önce ilgili dosyaları OKU; kök neden anlaşılmadan hiçbir şeyi değiştirme.');
    lines.push('- Yalnız kendi ajan klasörünün içinde değişiklik yap; ayar/sistem dosyalarına dokunma.');
    lines.push('- Emin olmadığın veya davranış değiştirecek bir düzeltmeyi YAPMA — bunun yerine ne yapılması gerektiğini raporla.');
    lines.push('- Çıktının sonunda madde madde özetle: ne düzeltildi, ne düzeltilemedi (ve neden), ne öneriliyor.');
    if (guideNote) { lines.push(`- Arka plan bilgisi: ${guideNote}`); }
    return lines.join('\n');
}

/** Short task title for a delegation. */
export function delegationTitle(insights: InsightLite[]): string {
    if (insights.length === 1) {
        return `Insight: ${insights[0].category}`;
    }
    const cats = [...new Set(insights.map(i => i.category))];
    return `Insights: ${cats.slice(0, 3).join(', ')}${cats.length > 3 ? '…' : ''} (${insights.length})`;
}

/**
 * Opt-in auto-delegation: pick which of the current insights should be
 * delegated now — category enabled, warning/error only, not delegated for the
 * same problem within the cooldown. Pure decision; the host queues the tasks
 * and persists lastDelegated.
 */
export function pickAutoDelegates<T extends InsightLite>(
    insights: T[],
    enabledCategories: string[],
    lastDelegated: Record<string, number>,
    now: number,
    cooldownMs = 24 * 3600 * 1000
): T[] {
    if (!enabledCategories.length) { return []; }
    const enabled = new Set(enabledCategories);
    const out: T[] = [];
    const seen = new Set<string>();
    for (const ins of insights) {
        if (ins.severity === 'info') { continue; }
        if (!enabled.has(ins.category)) { continue; }
        const key = insightKey(ins);
        if (seen.has(key)) { continue; }
        const last = lastDelegated[key] ?? 0;
        if (now - last < cooldownMs) { continue; }
        seen.add(key);
        out.push(ins);
    }
    return out;
}
