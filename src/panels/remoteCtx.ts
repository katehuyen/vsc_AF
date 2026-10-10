import * as vscode from 'vscode';
import { CTX_SUBMENUS, ctxPageActions } from '../core/ctxmenu';
import { ctxPhoneItems } from '../core/ctxPhone';

/**
 * X-443 — THE ROW MENU A PHONE IS SENT: the catalogue's page actions and the
 * host commands that have a phone answer (src/core/ctxPhone.ts), in the
 * catalogue's own group order. A command's words are the manifest's — the same
 * title VS Code's menu draws — and are read once.
 */
let titles: Map<string, string> | undefined;

function titleOf(command: string): string {
    if (!titles) {
        titles = new Map();
        const manifest = vscode.extensions?.getExtension?.('muvusoft.agent-farm')?.packageJSON as
            { contributes?: { commands?: { command?: string; title?: string }[] } } | undefined;
        for (const c of manifest?.contributes?.commands ?? []) {
            if (c.command) { titles.set(c.command, c.title ?? ''); }
        }
    }
    return titles.get(command) ?? '';
}

export function phoneCtxMenu(): { title: string; when: string; group: string; menu?: string }[] {
    const subLabel = new Map(CTX_SUBMENUS.map(s => [s.id, s.label]));
    const commands = ctxPhoneItems(titleOf).map(i => (i.menu ? { ...i, menu: subLabel.get(i.menu) || i.menu } : i));
    return [...ctxPageActions(), ...commands].sort((a, b) => a.group.localeCompare(b.group));
}
