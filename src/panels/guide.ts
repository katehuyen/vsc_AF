import * as fs from 'fs';
import * as vscode from 'vscode';
import { getNonce } from './base';

export type GuideLang = 'en' | 'tr';

interface DocSpec {
    /** Filename base; the real file is `${base}.${lang}.md` under docs/. */
    base: string;
    /** Languages actually authored — drives the in-panel switcher and fallback order. */
    langs: GuideLang[];
    title: Record<GuideLang, string>;
}

/**
 * User-facing help documents that ship in more than one language. To add a
 * language: author `docs/${base}.<lang>.md`, then extend `langs` + `title` (and
 * the `GuideLang` union + the `agentFarm.guideLanguage` enum in package.json).
 * Docs opened by raw filename (e.g. the internal dev roadmaps) bypass this table
 * and render single-language, untouched.
 */
const DOCS: Record<string, DocSpec> = {
    guide: {
        base: 'BLUEPRINT',
        langs: ['en', 'tr'],
        title: { en: 'Agent Farm — Guide', tr: 'Agent Farm — Kılavuz' }
    },
    examples: {
        base: 'ORNEKLER',
        langs: ['en', 'tr'],
        title: { en: 'Agent Farm — Examples', tr: 'Agent Farm — Örnek Kullanımlar' }
    }
};

const LANG_LABELS: Record<GuideLang, string> = { en: 'English', tr: 'Türkçe' };
const HTML_LANG: Record<GuideLang, string> = { en: 'en', tr: 'tr' };

/** The user's chosen help language (setting). Defaults to English. */
export function configuredGuideLang(): GuideLang {
    const v = vscode.workspace.getConfiguration('agentFarm').get<string>('guideLanguage', 'en');
    return v === 'tr' ? 'tr' : 'en';
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function slugify(s: string): string {
    return s.toLowerCase()
        .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
        .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}

function inline(md: string): string {
    let out = escapeHtml(md);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
        if (String(href).startsWith('#')) {
            return `<a href="${href}">${text}</a>`;
        }
        return `<a class="ext" data-href="${href}">${text}</a>`;
    });
    return out;
}

/**
 * Small markdown → HTML converter covering what the guide docs use.
 * Headings may carry an explicit stable anchor as a trailing `{#custom-id}` —
 * this decouples the anchor from the heading text so the same anchor token
 * resolves across languages (Turkish docs use the natural slug; translated docs
 * pin the same token with `{#token}`).
 */
export function renderMarkdown(md: string): { html: string; toc: { level: number; text: string; id: string }[] } {
    const lines = md.split(/\r?\n/);
    const html: string[] = [];
    const toc: { level: number; text: string; id: string }[] = [];
    let inCode = false;
    let listStack: ('ul' | 'ol')[] = [];
    let inTable = false;

    const closeLists = () => {
        while (listStack.length) { html.push(`</${listStack.pop()}>`); }
    };
    const closeTable = () => {
        if (inTable) { html.push('</tbody></table></div>'); inTable = false; }
    };

    for (const line of lines) {
        if (line.startsWith('```')) {
            closeLists(); closeTable();
            if (!inCode) { html.push('<pre><code>'); inCode = true; }
            else { html.push('</code></pre>'); inCode = false; }
            continue;
        }
        if (inCode) { html.push(escapeHtml(line)); continue; }

        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        if (heading) {
            closeLists(); closeTable();
            const level = heading[1].length;
            let text = heading[2].trim();
            let id: string;
            const explicit = /\s*\{#([A-Za-z0-9-]+)\}\s*$/.exec(text);
            if (explicit) { id = explicit[1]; text = text.slice(0, explicit.index).trim(); }
            else { id = slugify(text); }
            toc.push({ level, text, id });
            html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
            continue;
        }

        if (/^\s*---+\s*$/.test(line)) { closeLists(); closeTable(); html.push('<hr>'); continue; }

        if (/^\|/.test(line)) {
            closeLists();
            if (/^\|[\s:|-]+\|$/.test(line.trim())) { continue; } // separator row
            const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
            if (!inTable) {
                html.push('<div class="tablewrap"><table><tbody>');
                html.push('<tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr>');
                inTable = true;
            } else {
                html.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
            }
            continue;
        }
        closeTable();

        const bullet = /^(\s*)-\s+(.*)$/.exec(line);
        const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
        if (bullet || numbered) {
            const type: 'ul' | 'ol' = bullet ? 'ul' : 'ol';
            const content = (bullet ?? numbered)![2];
            if (!listStack.length || listStack[listStack.length - 1] !== type) {
                closeLists();
                html.push(`<${type}>`);
                listStack.push(type);
            }
            html.push(`<li>${inline(content)}</li>`);
            continue;
        }
        closeLists();

        if (/^>\s?/.test(line)) {
            html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
            continue;
        }
        if (line.trim() === '') { html.push(''); continue; }
        html.push(`<p>${inline(line)}</p>`);
    }
    closeLists(); closeTable();
    if (inCode) { html.push('</code></pre>'); }
    return { html: html.join('\n'), toc };
}

export class GuidePanel {
    private static open = new Map<string, GuidePanel>();
    private disposables: vscode.Disposable[] = [];
    private lang: GuideLang;

    /**
     * @param doc  a key in {@link DOCS} (bilingual help) or a raw `*.md` filename
     *             under docs/ (single-language, e.g. the dev roadmaps).
     */
    static show(
        extensionUri: vscode.Uri,
        anchor?: string,
        doc = 'guide',
        rawTitle?: string,
        lang?: GuideLang
    ): void {
        const existing = GuidePanel.open.get(doc);
        if (existing) {
            existing.panel.reveal();
            if (lang && lang !== existing.lang) { existing.setLang(lang); }
            if (anchor) { existing.anchor = anchor; existing.panel.webview.postMessage({ type: 'scrollTo', anchor }); }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.guide',
            'Agent Farm',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        GuidePanel.open.set(doc, new GuidePanel(panel, extensionUri, doc, rawTitle, anchor, lang));
    }

    private constructor(
        readonly panel: vscode.WebviewPanel,
        private extensionUri: vscode.Uri,
        private doc: string,
        private rawTitle?: string,
        private anchor?: string,
        lang?: GuideLang
    ) {
        this.lang = lang ?? configuredGuideLang();
        this.render();

        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'openExternal' && typeof msg.href === 'string') {
                vscode.env.openExternal(vscode.Uri.parse(msg.href));
            } else if (msg.type === 'setLang' && (msg.lang === 'en' || msg.lang === 'tr')) {
                // Persist the choice globally so every help surface follows it, then re-render.
                void vscode.workspace.getConfiguration('agentFarm')
                    .update('guideLanguage', msg.lang, vscode.ConfigurationTarget.Global);
                this.setLang(msg.lang);
            }
        }, null, this.disposables);
    }

    private setLang(lang: GuideLang): void {
        if (lang === this.lang) { return; }
        this.lang = lang;
        this.render();
    }

    private docPath(file: string): string {
        return vscode.Uri.joinPath(this.extensionUri, 'docs', file).fsPath;
    }

    private resolve(): { file: string; title: string; langs: GuideLang[]; lang: GuideLang } {
        const spec = DOCS[this.doc];
        if (!spec) {
            // Raw filename: single-language doc, rendered untouched.
            return { file: this.doc, title: this.rawTitle ?? 'Agent Farm', langs: [], lang: this.lang };
        }
        let lang: GuideLang = spec.langs.includes(this.lang)
            ? this.lang
            : (spec.langs.includes('en') ? 'en' : spec.langs[0]);
        if (!fs.existsSync(this.docPath(`${spec.base}.${lang}.md`))) {
            const alt = spec.langs.find(l => fs.existsSync(this.docPath(`${spec.base}.${l}.md`)));
            if (alt) { lang = alt; }
        }
        return { file: `${spec.base}.${lang}.md`, title: spec.title[lang], langs: spec.langs, lang };
    }

    private render(): void {
        const r = this.resolve();
        this.lang = r.lang;

        let md = `# Document not found\n\ndocs/${r.file} is missing.`;
        try { md = fs.readFileSync(this.docPath(r.file), 'utf8'); } catch { /* keep fallback */ }
        const { html, toc } = renderMarkdown(md);

        const tocHtml = toc
            .filter(t => t.level <= 3)
            .map(t => `<a class="toc-l${t.level}" href="#${t.id}">${escapeHtml(t.text)}</a>`)
            .join('');

        const langbar = r.langs.length > 1
            ? `<div id="langbar">${r.langs.map(l =>
                `<button class="af-lang${l === r.lang ? ' active' : ''}" data-lang="${l}">${LANG_LABELS[l]}</button>`
              ).join('')}</div>`
            : '';

        const nonce = getNonce();
        const css = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'common.css'));
        this.panel.title = r.title;
        this.panel.webview.html = `<!DOCTYPE html>
<html lang="${HTML_LANG[r.lang]}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}">
<style>
#langbar { position: fixed; top: 10px; right: 18px; display: flex; gap: 6px; z-index: 50; }
#langbar button {
    cursor: pointer; font: inherit; font-size: 11px; padding: 2px 10px; border-radius: 4px;
    border: 1px solid var(--vscode-widget-border, #4443);
    background: var(--vscode-editor-background); color: var(--vscode-foreground); opacity: .75;
}
#langbar button:hover { opacity: 1; }
#langbar button.active {
    opacity: 1; border-color: var(--vscode-button-background);
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
}
</style>
<title>${escapeHtml(r.title)}</title>
</head>
<body class="guide">
${langbar}
<nav id="toc">${tocHtml}</nav>
<main id="content">${html}</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
window.addEventListener('message', ev => {
    if (ev.data.type === 'scrollTo') {
        const el = document.getElementById(ev.data.anchor);
        if (el) { el.scrollIntoView({ behavior: 'smooth' }); el.classList.add('flash'); }
    }
});
document.addEventListener('click', ev => {
    const btn = ev.target.closest('button.af-lang');
    if (btn) { ev.preventDefault(); vscode.postMessage({ type: 'setLang', lang: btn.dataset.lang }); return; }
    const a = ev.target.closest('a');
    if (!a) { return; }
    if (a.classList.contains('ext')) {
        ev.preventDefault();
        vscode.postMessage({ type: 'openExternal', href: a.dataset.href });
    }
});
${this.anchor ? `setTimeout(() => { const el = document.getElementById(${JSON.stringify(this.anchor)}); if (el) { el.scrollIntoView(); el.classList.add('flash'); } }, 60);` : ''}
</script>
</body>
</html>`;
    }

    private dispose(): void {
        GuidePanel.open.delete(this.doc);
        for (const d of this.disposables) { d.dispose(); }
    }
}
