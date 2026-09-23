/**
 * OpenCode's reasoning level is `--variant`, and it is published PER MODEL (X-330).
 *
 * `opencode models --verbose` answers, per model, with the variants that model
 * accepts — some carry none, some low · medium · high, some minimal … xhigh. So
 * the question "may this run carry this level" has three parts, and all three
 * are answered here so no surface grows its own copy:
 *
 *   · the TRANSPORT — only a headless `opencode run` has the flag; the TUI takes
 *     none and ACP declares only model and mode, so a terminal or a Console card
 *     cannot carry one at all;
 *   · the MODEL — its own list, read off the catalog; a model that publishes
 *     none takes none;
 *   · IGNORANCE — a catalog that has not been read, or a model it does not name
 *     (the engine's default), refuses nothing: ignorance is not evidence.
 *
 * Pure: no vscode, no fs.
 */

export type EffortTransport = 'run' | 'tui' | 'hosted';

export interface VariantRow { ref: string; variants: string[] }

/** model ref → the variants it publishes (an empty list is a real answer). */
export function variantsByRef(rows: readonly VariantRow[] | undefined): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const r of rows ?? []) {
        if (r && r.ref) { out[r.ref] = [...new Set((r.variants ?? []).filter(v => !!v))]; }
    }
    return out;
}

/** The effort rows a picker draws for one model — none when it publishes none. */
export function variantEffortRows(
    model: string, variants: readonly string[]
): { id: string; label: string; detail: string }[] {
    if (!variants.length) { return []; }
    return [
        { id: '', label: 'Default', detail: `no --variant — ${model} runs at its own default` },
        ...variants.map(v => ({ id: v, label: v, detail: `${model} publishes this variant — sent as --variant` }))
    ];
}

/**
 * '' = nothing wrong; anything else is the sentence to refuse with.
 * `variantsOf` answers undefined when the catalog does not know the model.
 */
export function openCodeVariantRefusal(
    effort: string | undefined,
    o: { transport?: EffortTransport; model?: string; variantsOf?: (model: string) => string[] | undefined } = {}
): string {
    const value = String(effort ?? '').trim();
    if (!value) { return ''; }
    const transport = o.transport ?? 'run';
    if (transport !== 'run') {
        return `this run asks for variant "${value}" and OpenCode takes one only on a headless run — `
            + (transport === 'tui'
                ? 'its interactive TUI has no --variant flag'
                : 'a Console card talks ACP, which declares only model and mode')
            + ' — clear the effort, or run it headless';
    }
    const model = String(o.model ?? '').trim();
    const known = model ? o.variantsOf?.(model) : undefined;
    if (!known) { return ''; }
    if (!known.length) {
        return `this run asks for variant "${value}" and ${model} publishes no reasoning variants — clear the effort`;
    }
    if (!known.includes(value)) {
        return `${model} has no "${value}" variant (it publishes: ${known.join(', ')}) — pick one of those, or clear the effort`;
    }
    return '';
}
