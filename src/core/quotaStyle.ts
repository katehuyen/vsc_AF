/**
 * ‼️ U-154 — THE THREE QUOTA FIGURES, EACH IN ITS OWN LOOK, EVERYWHERE.
 *
 * Percent used, time left and reset time were drawn in one thin plain font, so
 * the reader had to READ a line to find the one figure they wanted. Each of the
 * three gets one class wherever it is drawn, and each class one style the user
 * owns in Farm Settings — colour, weight, font, anything CSS says — with the
 * defaults here as the way back.
 *
 * Pure: the caller hands in a reader for the settings, and gets the CSS text.
 */

export type QuotaFigure = 'pct' | 'left' | 'reset';

export interface QuotaFigureDef {
    id: QuotaFigure;
    /** the `agentFarm.` setting that holds this figure's CSS declarations */
    setting: string;
    /** the class every surface puts on this figure */
    cls: string;
    label: string;
    /** what an empty setting means — and what "reset to default" gives back */
    fallback: string;
}

export const QUOTA_FIGURES: readonly QuotaFigureDef[] = [
    {
        id: 'pct', setting: 'quotaStyle.percent', cls: 'afq-pct', label: 'Percent used',
        // not yellow or red: those are the surfaces' own 75% / 90% alarm tones
        fallback: 'color: var(--vscode-charts-purple, #b180d7); font-weight: 600;'
    },
    {
        id: 'left', setting: 'quotaStyle.left', cls: 'afq-left', label: 'Time left',
        fallback: 'color: var(--af-ink-charts-green, var(--vscode-charts-green, #89d185)); font-weight: 600;'
    },
    {
        id: 'reset', setting: 'quotaStyle.reset', cls: 'afq-reset', label: 'Reset time',
        fallback: 'color: var(--af-ink-charts-blue, var(--vscode-charts-blue, #75beff));'
    }
];

/**
 * A setting is CSS DECLARATIONS, never a stylesheet: anything that could close
 * the rule or open another (`{ } < > @`) is dropped, so a typo styles one
 * figure wrong instead of breaking every page, and nothing typed there can
 * escape the `<style>` element it is written into.
 */
export function safeDeclarations(raw: unknown): string {
    return String(raw ?? '').replace(/[{}<>@\\]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Two classes' weight: the user's look beats a surface's own base rule for the
 * figure (`.acwp`'s weight, a chip's colour), while a surface's ALARM — a
 * two-class tone like `.acwp.hot` or `.stale`, written after this — still wins.
 */
export function quotaSelector(f: QuotaFigureDef): string {
    return `:root .${f.cls}`;
}

/** The `<style>` body every page carries: one rule per figure. */
export function quotaStyleCss(read: (setting: string) => unknown): string {
    return QUOTA_FIGURES.map(f => {
        const own = safeDeclarations(read(f.setting));
        return `${quotaSelector(f)} { ${own || f.fallback} }`;
    }).join('\n');
}
