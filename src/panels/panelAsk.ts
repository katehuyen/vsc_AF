import * as vscode from 'vscode';

/**
 * X-447 — A PAGE ASKS WHOEVER IS LOOKING AT IT. A message, a confirmation, a
 * pick or a typed answer that a panel needs goes through its host: on the
 * desktop that IS vscode.window (the same call with the same arguments), on a
 * phone it is a sheet on the phone, answered there. Without it a phone's tap
 * that needed a confirmation opened the dialog on the PC and waited forever.
 */

type MessageRest = (vscode.MessageOptions | vscode.MessageItem | string)[];

/** vscode.QuickPickItemKind.Separator — read as its value, so the class needs no live enum. */
const SEPARATOR = -1;

export function phoneText(s: string): string {
    return s.replace(/\$\(check\)\s*/g, '✓ ').replace(/\$\([\w.-]+(?:~spin)?\)\s*/g, '').trim();
}

/** vscode.window's own signatures, overloads and all: a caller cannot tell the two apart. */
export interface PanelAsk {
    readonly info: typeof vscode.window.showInformationMessage;
    readonly warn: typeof vscode.window.showWarningMessage;
    readonly error: typeof vscode.window.showErrorMessage;
    readonly pick: typeof vscode.window.showQuickPick;
    readonly input: typeof vscode.window.showInputBox;
    readonly open: typeof vscode.window.showOpenDialog;
}

/** The desktop: vscode.window itself, argument for argument. */
export function desktopAsk(): PanelAsk {
    const w = vscode.window as unknown as Record<string, (...a: unknown[]) => Thenable<unknown>>;
    return {
        info: (...a: unknown[]) => w.showInformationMessage(...a),
        warn: (...a: unknown[]) => w.showWarningMessage(...a),
        error: (...a: unknown[]) => w.showErrorMessage(...a),
        pick: (...a: unknown[]) => w.showQuickPick(...a),
        input: (...a: unknown[]) => w.showInputBox(...a),
        open: (...a: unknown[]) => w.showOpenDialog(...a)
    } as unknown as PanelAsk;
}

export type AskLevel = 'info' | 'warn' | 'error';

/**
 * A phone's view: the question goes to the page as `afAsk` (media/afAsk.js
 * draws it) and the page's `afAskAnswer` settles it. A view that closes
 * settles everything still open as "no answer" — which is what dismissing a
 * VS Code dialog returns, so a caller needs no second path.
 */
export class RemoteAsk implements PanelAsk {
    private seq = 0;
    private live = true;
    private readonly pending = new Map<string, (value: unknown) => void>();

    constructor(private readonly post: (message: unknown) => void) { }

    // The interface's generics answer with the caller's own item; `any` lets one body serve every T.
    info(message: string, ...rest: MessageRest): Thenable<any> { return this.shown('info', message, rest); }
    warn(message: string, ...rest: MessageRest): Thenable<any> { return this.shown('warn', message, rest); }
    error(message: string, ...rest: MessageRest): Thenable<any> { return this.shown('error', message, rest); }

    /** A separator row and a `$(icon)` are VS Code's own: the phone gets neither, and a `$(check)` still says ✓. */
    async pick(items: unknown, options?: vscode.QuickPickOptions): Promise<any> {
        const list = (await (items as Thenable<readonly unknown[]>)) as readonly (string | vscode.QuickPickItem)[];
        const offered = list.filter(i => typeof i === 'string' || i.kind !== SEPARATOR);
        const many = options?.canPickMany === true;
        const rows = offered.map(i => typeof i === 'string' ? { label: phoneText(i) } : {
            label: phoneText(i.label),
            ...(i.description ? { description: phoneText(i.description) } : {}),
            ...(i.detail ? { detail: phoneText(i.detail) } : {}),
            ...(many && i.picked ? { picked: true } : {})
        });
        const at = await this.ask({ kind: 'pick', title: options?.title, placeHolder: options?.placeHolder, items: rows, ...(many ? { many } : {}) });
        const valid = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < offered.length;
        if (many) { return Array.isArray(at) ? [...new Set(at.filter(valid))].sort((a, b) => a - b).map(n => offered[n]) : undefined; }
        return valid(at) ? offered[at] : undefined;
    }

    async input(options?: vscode.InputBoxOptions): Promise<string | undefined> {
        const got = await this.ask({
            kind: 'input', title: options?.title, prompt: options?.prompt, placeHolder: options?.placeHolder,
            value: options?.value, password: options?.password === true
        });
        return typeof got === 'string' ? got : undefined;
    }

    /** Files on the PC cannot be chosen from a phone: said, and answered as a cancelled dialog. */
    open(): Thenable<undefined> {
        this.note('info', 'Choosing files on the PC is not available on the phone — attach from the phone instead.');
        return Promise.resolve(undefined);
    }

    /** The page's answer to a question it was asked. False when it names nothing open. */
    answer(message: unknown): boolean {
        const m = message as { id?: unknown; value?: unknown } | null;
        const id = typeof m?.id === 'string' ? m.id : '';
        const settle = this.pending.get(id);
        if (!settle) { return false; }
        this.pending.delete(id);
        settle(m?.value);
        return true;
    }

    end(): void {
        this.live = false;
        for (const settle of this.pending.values()) { settle(undefined); }
        this.pending.clear();
    }

    private shown(level: AskLevel, message: string, rest: MessageRest): Promise<unknown> {
        const options = rest.find((r): r is vscode.MessageOptions => !!r && typeof r === 'object' && !('title' in r));
        const items = rest.filter((r): r is string | vscode.MessageItem => typeof r === 'string' || (!!r && typeof r === 'object' && 'title' in r));
        if (!items.length) { this.note(level, message, options?.detail); return Promise.resolve(undefined); }
        return this.ask({
            kind: 'message', level, message, detail: options?.detail, modal: options?.modal === true,
            buttons: items.map(i => typeof i === 'string' ? i : i.title)
        }).then(at => typeof at === 'number' && at >= 0 && at < items.length ? items[at] : undefined);
    }

    private note(level: AskLevel, message: string, detail?: string): void {
        if (this.live) { this.post({ type: 'afAsk', kind: 'note', level, message, ...(detail ? { detail } : {}) }); }
    }

    private ask(question: Record<string, unknown>): Promise<unknown> {
        if (!this.live) { return Promise.resolve(undefined); }
        const id = 'ask' + (++this.seq);
        return new Promise(resolve => {
            this.pending.set(id, resolve);
            this.post({ type: 'afAsk', id, ...question });
        });
    }
}
