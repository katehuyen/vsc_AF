/** U-178 — where a sound control's refusal lands, and how its page redraws: what differs per page. */

/** Where a refusal lands on a page — the key its error line is drawn under. */
export const ALERT_ERROR_KEY = 'agentFarm.alerts.voices';

/** What differs per page. */
export interface AlertSurface {
    /** show a refusal against the controls (`{ type: 'error', key: ALERT_ERROR_KEY }`) */
    error(text: string): void;
    /** redraw the page from its data */
    refresh(): void;
    /** U-180 — answer the session panel directly (pages that draw it) */
    post?(msg: object): void;
}

/** U-180 — the surface of a page that draws only the session panel (Console,
 *  Live Timeline): refusals and profiles go straight back to the panel. */
export function soundSurface(webview: { postMessage(m: unknown): Thenable<boolean> | Promise<boolean> | boolean }): AlertSurface {
    const post = (m: object) => { void Promise.resolve(webview.postMessage(m)).then(undefined, () => undefined); };
    return {
        error: error => post({ type: 'soundPopError', sessionId: '', error }),
        refresh: () => undefined,
        post
    };
}
