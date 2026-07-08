import * as fs from 'fs';
import * as vscode from 'vscode';
import { getNonce } from './base';

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

/** Small markdown → HTML converter covering what BLUEPRINT.tr.md uses. */
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
            const text = heading[2].trim();
            const id = slugify(text);
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

    static show(
        extensionUri: vscode.Uri,
        anchor?: string,
        docFile = 'BLUEPRINT.tr.md',
        title = 'Agent Farm — Kılavuz'
    ): void {
        const existing = GuidePanel.open.get(docFile);
        if (existing) {
            existing.panel.reveal();
            if (anchor) {
                existing.panel.webview.postMessage({ type: 'scrollTo', anchor });
            }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.guide',
            title,
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        GuidePanel.open.set(docFile, new GuidePanel(panel, extensionUri, docFile, anchor));
    }

    private constructor(
        readonly panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private docFile: string,
        anchor?: string
    ) {
        const mdPath = vscode.Uri.joinPath(extensionUri, 'docs', this.docFile).fsPath;
        let md = `# Belge bulunamadı\n\ndocs/${this.docFile} eksik.`;
        try { md = fs.readFileSync(mdPath, 'utf8'); } catch { /* keep fallback */ }
        const { html, toc } = renderMarkdown(md);

        const tocHtml = toc
            .filter(t => t.level <= 3)
            .map(t => `<a class="toc-l${t.level}" href="#${t.id}">${escapeHtml(t.text)}</a>`)
            .join('');

        const nonce = getNonce();
        const css = panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'common.css'));
        panel.webview.html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}">
<title>Agent Farm Kılavuzu</title>
</head>
<body class="guide">
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
    const a = ev.target.closest('a');
    if (!a) { return; }
    if (a.classList.contains('ext')) {
        ev.preventDefault();
        vscode.postMessage({ type: 'openExternal', href: a.dataset.href });
    }
});
${anchor ? `setTimeout(() => { const el = document.getElementById(${JSON.stringify(anchor)}); if (el) { el.scrollIntoView(); el.classList.add('flash'); } }, 60);` : ''}
</script>
</body>
</html>`;

        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'openExternal' && typeof msg.href === 'string') {
                vscode.env.openExternal(vscode.Uri.parse(msg.href));
            }
        }, null, this.disposables);
    }

    private dispose(): void {
        GuidePanel.open.delete(this.docFile);
        for (const d of this.disposables) { d.dispose(); }
    }
}
