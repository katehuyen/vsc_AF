/**
 * F3 — Browser automation steps. Agent Farm ships no browser engine:
 * the step runs the agent (claude) which drives a browser MCP server the
 * user installed for that agent (e.g. chrome-devtools / playwright MCP).
 * Agent Farm's job is the safety envelope: a hard host allowlist and an
 * optional per-step approval gate — both non-negotiable by default.
 */

export function hostOf(url: string): string | undefined {
    try { return new URL(url).hostname.toLowerCase(); } catch { return undefined; }
}

/** true if the URL's host is one of the allowed hosts or a subdomain of one. */
export function hostAllowed(url: string, allowHosts: string[]): boolean {
    const host = hostOf(url);
    if (!host || !allowHosts.length) { return false; }
    return allowHosts.some(raw => {
        const allowed = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
        return !!allowed && (host === allowed || host.endsWith('.' + allowed));
    });
}

/** The prompt the browsing agent runs with — allowlist stated as a hard rule. */
export function buildBrowserPrompt(url: string, goal: string, allowHosts: string[]): string {
    return `Tarayıcı otomasyonu görevi. MCP tarayıcı araçlarını kullan (chrome-devtools veya playwright MCP — ` +
        `sayfa açma, tıklama, form doldurma, içerik okuma). ` +
        `1) Şu adrese git: ${url} ` +
        `2) HEDEF: ${goal} ` +
        `KESİN KURAL: yalnızca şu alan adlarında gezinebilirsin: ${allowHosts.join(', ')} — ` +
        `bu listenin dışına çıkan hiçbir bağlantıyı açma, yönlendirmeleri izleme. ` +
        `Giriş bilgisi isteyen sayfalarda kimlik bilgisi UYDURMA; oturum yoksa bunu raporla. ` +
        `Bittiğinde bulgularını düz metin olarak raporla (sonraki zincir adımı bu raporu {prev_text} olarak alır). ` +
        `Tarayıcı MCP aracın yoksa hiçbir şey deneme, 'BROWSER MCP YOK' yaz ve nedenini açıkla.`;
}
