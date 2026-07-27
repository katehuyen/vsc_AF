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
            // enableFindWidget gives the guide VS Code's own ctrl+F on top of
            // the page's section-aware search box — the muscle-memory key works
            // even before anyone notices the box.
            { enableScripts: true, retainContextWhenHidden: true, enableFindWidget: true }
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
/* In-guide search (E3): 1900 lines of manual are only useful if you can find
   the paragraph you need. The box filters the table of contents to the
   sections that actually match and walks the hits inside the page. */
#gsearch { position: fixed; top: 8px; left: 12px; right: 200px; z-index: 51;
    display: flex; gap: 6px; align-items: center; max-width: 640px; }
#gsearch input { flex: 1; min-width: 120px; font: inherit; font-size: 12px; padding: 4px 9px;
    border-radius: 5px; border: 1px solid var(--vscode-widget-border, #4443);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
#gsearch button { cursor: pointer; font: inherit; font-size: 11px; padding: 3px 9px; border-radius: 4px;
    border: 1px solid var(--vscode-widget-border, #4443);
    background: var(--vscode-editor-background); color: var(--vscode-foreground); opacity: .8; }
#gsearch button:hover { opacity: 1; }
#gcount { font-size: 11px; color: var(--vscode-descriptionForeground); white-space: nowrap; }
mark.af-hit { background: var(--vscode-editor-findMatchHighlightBackground, #ea5c0055);
    color: inherit; border-radius: 2px; }
mark.af-hit.cur { background: var(--vscode-editor-findMatchBackground, #a8ac94);
    color: var(--vscode-editor-foreground); outline: 1px solid var(--vscode-focusBorder); }
#toc a.nohit { opacity: .28; }
body.guide.searching #content h1, body.guide.searching #content h2,
body.guide.searching #content h3 { scroll-margin-top: 46px; }
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
<div id="gsearch">
    <input id="gq" type="search" placeholder="Search this guide…  (Enter = next, Esc = clear)" autocomplete="off">
    <button id="gprev" title="Previous hit">↑</button>
    <button id="gnext" title="Next hit">↓</button>
    <span id="gcount"></span>
</div>
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

// ---- E3: in-guide search ------------------------------------------------
// Marks every hit in the page, walks them with Enter / ↑ ↓, and — the part a
// browser's find cannot do — dims the table of contents down to the sections
// that actually contain the word, so a 1900-line manual answers "where is
// this explained?" instead of just "here is the next occurrence".
(function () {
    const content = document.getElementById('content');
    const box = document.getElementById('gq');
    const countEl = document.getElementById('gcount');
    const tocLinks = Array.from(document.querySelectorAll('#toc a'));
    if (!content || !box) { return; }
    let hits = [];
    let cur = -1;

    function clearMarks() {
        content.querySelectorAll('mark.af-hit').forEach(m => {
            const t = document.createTextNode(m.textContent);
            m.parentNode.replaceChild(t, m);
        });
        content.normalize();
        tocLinks.forEach(a => a.classList.remove('nohit'));
        document.body.classList.remove('searching');
        hits = []; cur = -1;
    }

    /** id of the nearest heading above this node — which section a hit is in. */
    function sectionOf(node) {
        let el = node.parentElement;
        while (el && el !== content) {
            let sib = el.previousElementSibling;
            while (sib) {
                if (/^H[1-6]$/.test(sib.tagName) && sib.id) { return sib.id; }
                sib = sib.previousElementSibling;
            }
            el = el.parentElement;
        }
        return '';
    }

    function run(q) {
        clearMarks();
        const needle = q.trim().toLowerCase();
        if (needle.length < 2) { countEl.textContent = ''; return; }
        const sections = new Set();
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
            acceptNode: n => (n.parentElement && /SCRIPT|STYLE|MARK/.test(n.parentElement.tagName))
                ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        });
        const targets = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.toLowerCase().indexOf(needle) >= 0) { targets.push(node); }
        }
        for (const text of targets) {
            const sec = sectionOf(text);
            const frag = document.createDocumentFragment();
            let rest = text.nodeValue;
            let idx = rest.toLowerCase().indexOf(needle);
            while (idx >= 0) {
                if (idx > 0) { frag.appendChild(document.createTextNode(rest.slice(0, idx))); }
                const mark = document.createElement('mark');
                mark.className = 'af-hit';
                mark.textContent = rest.slice(idx, idx + needle.length);
                frag.appendChild(mark);
                hits.push(mark);
                if (sec) { sections.add(sec); }
                rest = rest.slice(idx + needle.length);
                idx = rest.toLowerCase().indexOf(needle);
            }
            if (rest) { frag.appendChild(document.createTextNode(rest)); }
            text.parentNode.replaceChild(frag, text);
        }
        // the answer to "where is this explained?"
        tocLinks.forEach(a => {
            const id = decodeURIComponent((a.getAttribute('href') || '').slice(1));
            if (!sections.has(id)) { a.classList.add('nohit'); }
        });
        document.body.classList.add('searching');
        countEl.textContent = hits.length
            ? hits.length + ' hit' + (hits.length === 1 ? '' : 's') + ' in ' + sections.size + ' section' + (sections.size === 1 ? '' : 's')
            : 'no match';
        if (hits.length) { go(0); }
    }

    function go(i) {
        if (!hits.length) { return; }
        if (cur >= 0 && hits[cur]) { hits[cur].classList.remove('cur'); }
        cur = (i + hits.length) % hits.length;
        hits[cur].classList.add('cur');
        hits[cur].scrollIntoView({ behavior: 'smooth', block: 'center' });
        countEl.textContent = (cur + 1) + '/' + hits.length + ' · ' + countEl.textContent.replace(/^\\d+\\/\\d+ · /, '');
    }

    let timer = null;
    box.addEventListener('input', () => {
        if (timer) { clearTimeout(timer); }
        timer = setTimeout(() => run(box.value), 180);
    });
    box.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); go(cur + (ev.shiftKey ? -1 : 1)); }
        if (ev.key === 'Escape') { box.value = ''; clearMarks(); countEl.textContent = ''; }
    });
    document.getElementById('gnext').addEventListener('click', () => go(cur + 1));
    document.getElementById('gprev').addEventListener('click', () => go(cur - 1));
})();
</script>
</body>
</html>`;
    }

    private dispose(): void {
        GuidePanel.open.delete(this.doc);
        for (const d of this.disposables) { d.dispose(); }
    }
}
