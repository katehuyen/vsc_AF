/**
 * X-103 — THE START-SESSION FORM, DRAWN BY THE ADAPTER RATHER THAN BY THE FORM.
 *
 * X-101 gave every launch surface one symbol to resolve a runtime through, and
 * then left the choice itself unreachable: a route was picked by hand-editing
 * `agentFarm.agentEngineDefaults[<agent>]["claude"].providerId` in settings.json
 * — measured, there was no UI at all. This module is the other half. It answers,
 * for one engine and one adapter, the four questions a person answers in order:
 *
 *     ENGINE  ->  PROVIDER  ->  MODEL (or TIER)  ->  VARIANT / EFFORT
 *
 * ‼️ AND IT ASKS THE ADAPTER, NEVER THE ENGINE NAME. A form with
 * `if (engine === 'claude')` in it is a second statement of what each engine
 * offers, and the day an adapter changes its mind the form goes on drawing the
 * old answer confidently. Everything below reads `adapter.axis`,
 * `adapter.catalog()` and — the load-bearing one — `adapter.normalizeSelection`,
 * which is the engine's own word for "I recognise this pick".
 *
 * ‼️ THE TWO ENGINES MEAN DIFFERENT THINGS BY THE SECOND ROW, and that is the
 * whole reason this is a module and not a list.
 *
 *   · **Claude** picks a ROUTE, and under it a TIER. A tier is not a model:
 *     `opus` is one model on Anthropic's endpoint and another on Kimi's, so the
 *     route has to be chosen before the word means anything.
 *   · **OpenCode** picks a PROVIDER, and under it a MODEL — the engine's own
 *     wire spelling, `provider/model`, passed through unassembled.
 *
 * ‼️ AND ONLY WHAT CAN ACTUALLY RUN IS OFFERED. The Claude catalog carries the
 * shipped route TEMPLATES (`anthropic`, `kimi`, `minimax`) beside the user's own
 * profiles, and a template is a SHAPE — no id to store a credential under, no
 * revision, nothing behind it. Offering one would produce a selection the
 * adapter answers `undefined` to, which resolves to `unknown` identity and
 * injects no environment: the session would quietly run on whatever the shell
 * was already carrying while the row said "Kimi". That is the exact lie X-101
 * was written to make impossible, so the filter is the adapter's own
 * `normalizeSelection` rather than a rule restated here.
 *
 * Pure — no vscode, no I/O, no keychain.
 */

import { LaunchChoice } from './launch';
import { ProviderAdapter, ProviderSelection } from './providerAdapter';
import { CatalogModelRow, ProviderCatalogRead } from './providerCatalog';
import { ProviderScope } from './providerIdentity';
import { authKindLabel } from './routeAuth';

/** What a person has picked on the provider axis so far. */
export interface ProviderPick {
    /** Claude: the id of a stored route profile. OpenCode: the engine's provider id. */
    providerId?: string;
    /** Claude only — which tier of that route. */
    tier?: string;
    /** OpenCode: the wire-qualified model ref. Claude: the plain `--model` value. */
    model?: string;
    /** Only where the engine publishes variants for the chosen model. */
    variant?: string;
}

/** The row under the provider — a tier on one engine, a model on the other. */
export interface ProviderSubAxis {
    kind: 'tier' | 'model' | 'none';
    /** The row's label: `Tier`, `Model`, or '' when it is not drawn. */
    label: string;
    /** One line for the row's detail — what picking here decides. */
    note: string;
    choices: LaunchChoice[];
}

/**
 * ‼️ WHICH WAY THE ENGINE IS BEING SPOKEN TO — and it decides a row, which is
 * why the form takes it rather than the engine name alone.
 *
 * The item says variant/effort is offered "only where the engine OR THE
 * TRANSPORT supports it", and on OpenCode that is not a figure of speech:
 * measured against the installed CLI, `opencode run --variant` exists and the
 * bare TUI's `--help` has no such flag, while ACP 1.18.18 declares only `model`
 * and `mode` (`core/opencode.ts`). So the same model publishes `low/medium/high`
 * and the answer to "may I pick one" is yes on a headless run and no in a
 * terminal or on a hosted card. A form that asked the engine would offer a
 * control two of the three doors then silently drop.
 */
export type ProviderTransport = 'tui' | 'acp' | 'run';

export interface ProviderForm {
    engine: string;
    /**
     * ‼️ FALSE IS A COMPLETE ANSWER. Four of the five engines have no provider
     * axis, and a form that drew a disabled row for them would spend a line
     * asking a question that has no answers — the row is simply not there.
     */
    applies: boolean;
    /** The word THIS engine uses for the first row: `Route` or `Provider`. */
    noun: string;
    /** How long the pick lasts — a Claude route is the session, an OpenCode
     *  provider may legitimately change at a turn boundary. */
    scope: ProviderScope;
    scopeNote: string;
    /** What may be picked. `id: ''` is always "leave it alone". */
    providers: LaunchChoice[];
    /** ‼️ WHY THERE IS NOTHING, when there is nothing. An empty picker with no
     *  words is the failure this field exists to prevent: the reader cannot tell
     *  "you have not set one up" from "we could not ask the engine". */
    empty?: string;
    sub: ProviderSubAxis;
    variants: LaunchChoice[];
    /** ‼️ Why the variant row is not drawn, when the chosen model publishes some
     *  but this transport cannot carry them. Silence here is how a person comes
     *  to believe the engine has no variants at all. */
    variantsWhy?: string;
    /**
     * ‼️ X-113 - WHAT THIS PICK WOULD BE REFUSED FOR, WHERE THE PICK IS MADE.
     *
     * The adapter has answered this since X-99 and nothing but a bridge op
     * ever asked: a model the engine stopped offering, a tier the route does
     * not map, a third-party endpoint with no stored key, a model that
     * publishes no tool calling. The comment on `pruneProviderPick` below says
     * a refusal is something "a person reads in a terminal" - which was the
     * whole defect, because by then the choosing is over.
     *
     * ‼️ IT IS A WARNING, NOT A GATE. Nothing here stops a launch: the
     * catalog can be stale, the engine is the authority on its own run, and a
     * form that refused on a reading would be worse than one that stayed
     * quiet. Absent when there is nothing to say.
     */
    refusals?: string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The row that means "do not decide this here". Every axis has exactly one. */
const leaveAlone = (detail: string): LaunchChoice => ({ id: '', label: 'Default', detail });

const emptyAxis: ProviderSubAxis = { kind: 'none', label: '', note: '', choices: [] };

const readOf = (adapter: ProviderAdapter): ProviderCatalogRead => {
    const cat = adapter.catalog() as ProviderCatalogRead;
    return { ...cat, rows: cat.rows ?? [] };
};

/** A model row, described the way a picker needs it: the figures the engine
 *  published, and nothing invented where it published none. */
function modelDetail(row: CatalogModelRow): string {
    const bits: string[] = [];
    if (row.limit.context) { bits.push(`${Math.round(row.limit.context / 1000)}K context`); }
    if (row.limit.output) { bits.push(`${Math.round(row.limit.output / 1000)}K out`); }
    // ‼️ A STATED ZERO IS A STATED ZERO — `free` is a fact the engine published,
    // and an absent cost is a different fact that gets no word at all.
    if (row.cost && !row.cost.input && !row.cost.output) { bits.push('free'); }
    const caps = row.capabilities;
    if (caps.reasoning) { bits.push('reasoning'); }
    // ‼️ X-113 - AND THE NOS, WHICH THIS LINE USED TO LEAVE OUT ENTIRELY.
    // Measured on OpenCode 1.18.19: every model this machine reaches publishes
    // `attachment: false` and `input.image: false`, and the row said nothing -
    // so a line that listed only what a model CAN do read as a full
    // description while being half of one. A published `false` gets a word; a
    // field the engine never stated still gets none.
    if (caps.toolcall === false) { bits.push('no tools'); }
    if (caps.attachment === false) { bits.push('no attachments'); }
    else if (caps.input?.image === false) { bits.push('no images'); }
    if (row.variants.length) { bits.push(`variants: ${row.variants.join(', ')}`); }
    if (row.status && row.status !== 'active') { bits.push(row.status); }
    return bits.join(' · ') || row.ref;
}

/**
 * ‼️ THE FILTER IS THE ADAPTER'S OWN WORD. `normalizeSelection` returning
 * `undefined` is the engine saying it would not recognise this pick, and that is
 * a far stronger statement than any list this module could keep — see the
 * template/profile trap in the header.
 */
function runnableProviders(adapter: ProviderAdapter, cat: ProviderCatalogRead): LaunchChoice[] {
    const out: LaunchChoice[] = [];
    for (const p of cat.providers || []) {
        const id = str(p.providerId);
        if (!id) { continue; }
        if (!adapter.normalizeSelection({ engine: adapter.engine, providerId: id })) { continue; }
        const bits: string[] = [];
        if (p.note) { bits.push(p.note); }
        if (p.route?.baseUrl) { bits.push(p.route.baseUrl); }
        else if (p.route) { bits.push("the engine's own endpoint"); }
        if (p.route?.authKind) { bits.push(authKindLabel(p.route.authKind)); }
        const models = (p.models || []).filter(Boolean);
        if (models.length) { bits.push(`${models.length} model${models.length === 1 ? '' : 's'}`); }
        out.push({ id, label: p.providerLabel || id, detail: bits.join(' · ') || id });
    }
    return out;
}

/** Why the provider list is empty — in the words that name the fix. */
function emptyWhy(adapter: ProviderAdapter, cat: ProviderCatalogRead): string {
    if (adapter.engine === 'claude') {
        return 'no route profiles yet — add one on the Providers page. '
            + 'The shipped routes (Anthropic, Kimi, MiniMax) are SHAPES, not sign-ins: '
            + 'a profile is what holds the key, so only profiles can be launched on.';
    }
    if (cat.source === 'not-fetched') {
        return 'the engine has not been asked yet — its catalog is read in the background '
            + '(`opencode models --verbose`) and is usually there a few seconds after the window opens.';
    }
    return 'the engine published no providers here.';
}

/**
 * The tier row, for the route that is currently picked.
 *
 * ‼️ A ROUTE THAT MAPS NO TIERS IS NOT AN EMPTY LIST, IT IS NO ROW. The
 * first-party rows map nothing on purpose (`CLAUDE_ROUTE_TEMPLATES`) — they
 * serve whatever model they are given — so drawing an empty picker there would
 * invite somebody to look for a setting that correctly does not exist.
 */
function tierAxis(cat: ProviderCatalogRead, providerId: string): ProviderSubAxis {
    const t = (cat.templates || []).find(x => x.providerId === providerId);
    const tiers = Object.keys(t?.tiers ?? {});
    if (!providerId || !tiers.length) { return emptyAxis; }
    return {
        kind: 'tier',
        label: 'Tier',
        // The sentence a tier row has to carry, or the word means nothing: the
        // ROUTE decides which model each tier is.
        note: `which model "${t?.providerLabel || providerId}" serves — the route decides, not the name`,
        choices: [
            leaveAlone(`the route's own choice (${t?.providerLabel || providerId} maps: ${tiers.join(', ')})`),
            ...tiers.map(id => ({ id, label: id, detail: `${providerId} serves ${t?.tiers[id]} for "${id}"` }))
        ]
    };
}

/** The model row: the engine's own wire refs, narrowed to the chosen provider. */
function modelAxis(cat: ProviderCatalogRead, providerId: string): ProviderSubAxis {
    const rows = (cat.rows || []).filter(r => !providerId || r.providerId === providerId);
    if (!rows.length) { return emptyAxis; }
    return {
        kind: 'model',
        label: 'Model',
        note: providerId
            ? `what ${providerId} publishes — passed to the engine as -m, unassembled`
            : 'every model the engine published — passed as -m, unassembled',
        choices: [
            leaveAlone("the engine's own default model"),
            ...rows.map(r => ({ id: r.ref, label: r.label || r.ref, detail: modelDetail(r) }))
        ]
    };
}

/**
 * ‼️ ONLY WHERE THE ENGINE REALLY PUBLISHES THEM — the item's third acceptance
 * clause, and it is measured per MODEL rather than per engine: of the six models
 * this machine's OpenCode offers, some carry `"variants": {}` and some carry
 * low/medium/high. A row drawn from the engine's name would offer a reasoning
 * level on a model that has none.
 */
function variantChoices(cat: ProviderCatalogRead, modelRef: string): LaunchChoice[] {
    const row = (cat.rows || []).find(r => r.ref === modelRef);
    const variants = row?.variants ?? [];
    if (!variants.length) { return []; }
    return [
        leaveAlone(`${row?.label || modelRef} runs at its own default`),
        ...variants.map(id => ({ id, label: id, detail: `${row?.label || modelRef} published this variant` }))
    ];
}

/**
 * THE FORM, for one adapter and the pick made so far.
 *
 * Called on every redraw of the launcher, because every row below the provider
 * depends on the row above it — that is what "capability-driven" means here.
 */
export function launchProviderForm(
    adapter: ProviderAdapter, pick: ProviderPick = {}, transport: ProviderTransport = 'run'
): ProviderForm {
    const engine = adapter.engine;
    if (adapter.axis !== 'provider') {
        return {
            engine, applies: false, noun: '', scope: adapter.providerScope,
            scopeNote: '', providers: [], sub: emptyAxis, variants: []
        };
    }
    const cat = readOf(adapter);
    const providerId = str(pick.providerId);
    const claude = !!cat.templates;
    const providers = runnableProviders(adapter, cat);
    const noun = claude ? 'Route' : 'Provider';
    const scopeNote = adapter.canSwitchProviderAtTurnBoundary
        ? 'the engine may change this at a turn boundary, and records it as a new turn identity'
        : 'fixed for the session — a different route is a different program, so a resume across one forks';
    const sub = claude ? tierAxis(cat, providerId) : modelAxis(cat, providerId);
    return {
        engine, applies: true, noun,
        scope: adapter.providerScope,
        scopeNote,
        providers: [
            leaveAlone(claude
                ? 'nothing injected and nothing cleared — the shell’s own environment decides'
                : "the engine's own current provider"),
            ...providers
        ],
        ...(providers.length ? {} : { empty: emptyWhy(adapter, cat) }),
        sub,
        ...variantRow(cat, claude, str(pick.model), transport),
        ...refusalRow(adapter, pick)
    };
}

/** The adapter's own refusal for the pick so far, left out when empty so a
 *  surface cannot draw an empty warning box. */
function refusalRow(adapter: ProviderAdapter, pick: ProviderPick): { refusals?: string[] } {
    const refusals = adapter.preflight(providerSelectionOf(adapter.engine, pick));
    return refusals.length ? { refusals } : {};
}

/**
 * The variant row, and the sentence that replaces it when the transport cannot
 * carry one. Returns the two fields together so a caller cannot end up with a
 * list AND a reason why there is no list.
 */
function variantRow(
    cat: ProviderCatalogRead, claude: boolean, modelRef: string, transport: ProviderTransport
): { variants: LaunchChoice[]; variantsWhy?: string } {
    // Claude's reasoning axis is `--effort`, which is already a row of its own on
    // every form here; a second one under a different name would be two controls
    // for one question.
    if (claude) { return { variants: [] }; }
    const offered = variantChoices(cat, modelRef);
    if (!offered.length) { return { variants: [] }; }
    if (transport === 'run') { return { variants: offered }; }
    return {
        variants: [],
        variantsWhy: transport === 'tui'
            ? 'this model publishes variants, but the interactive TUI takes no --variant flag '
                + '(measured against the installed CLI) — a headless task can pick one'
            : 'this model publishes variants, but ACP declares only model and mode, so a hosted '
                + 'card cannot carry one — a headless task can pick one'
    };
}

/** One dropped value, in the words a person needs to see it happen. */
export interface DroppedPick {
    field: 'tier' | 'model' | 'variant' | 'providerId';
    value: string;
    why: string;
}

/**
 * ‼️ WHEN THE ROW ABOVE CHANGES, THE ROWS BELOW ARE NOT SILENTLY WRONG — the
 * item's second acceptance clause.
 *
 * Picking Kimi after choosing a MiniMax tier leaves a tier the new route does
 * not map; picking a different OpenCode provider leaves a model it does not
 * serve. Both would spawn: the tier reaches `preflight` as a refusal a person
 * reads in a terminal, and the model reaches the engine as a `-m` it rejects.
 * So they are dropped here, at the moment of the change — and the drop is
 * REPORTED rather than silent, because a value vanishing out of a form with no
 * word is how a person comes to distrust the form.
 */
export function pruneProviderPick(
    adapter: ProviderAdapter, pick: ProviderPick, transport: ProviderTransport = 'run'
): { pick: ProviderPick; dropped: DroppedPick[] } {
    const dropped: DroppedPick[] = [];
    const next: ProviderPick = { ...pick };
    const has = (list: LaunchChoice[], v: string) => list.some(c => c.id && c.id === v);

    if (adapter.axis !== 'provider') {
        // The whole axis is gone — a provider value on an engine that has none is
        // the Claude-shaped field riding along on a Gemini run (X-98).
        for (const f of ['providerId', 'tier', 'model', 'variant'] as const) {
            // ‼️ THE MODEL SURVIVES. It is `--model` on every engine here, not a
            // provider-axis value, and dropping it would empty the model row of
            // every engine without an adapter.
            if (f === 'model') { continue; }
            const v = str(next[f]);
            if (!v) { continue; }
            dropped.push({ field: f, value: v, why: `${adapter.engine} has no provider axis` });
            delete next[f];
        }
        return { pick: next, dropped };
    }

    const form = launchProviderForm(adapter, next, transport);
    const providerId = str(next.providerId);
    if (providerId && !has(form.providers, providerId)) {
        dropped.push({
            field: 'providerId', value: providerId,
            why: form.providers.length > 1
                ? `${form.noun.toLowerCase()} is not one of: ${form.providers.filter(c => c.id).map(c => c.id).join(', ')}`
                : (form.empty || 'nothing is on offer here')
        });
        delete next.providerId;
        delete next.tier;
    }

    const after = launchProviderForm(adapter, next, transport);
    const tier = str(next.tier);
    if (tier) {
        if (after.sub.kind !== 'tier') {
            dropped.push({ field: 'tier', value: tier, why: `${after.engine} has no tier axis here` });
            delete next.tier;
        } else if (!has(after.sub.choices, tier)) {
            dropped.push({
                field: 'tier', value: tier,
                why: `this route maps: ${after.sub.choices.filter(c => c.id).map(c => c.id).join(', ')}`
            });
            delete next.tier;
        }
    }

    const model = str(next.model);
    // ‼️ ONLY WHERE THE CATALOG IS A REAL ANSWER. A model row narrowed to a
    // provider is a statement about what that provider serves; an unread catalog
    // (`kind: 'none'`) states nothing, and dropping a model against it would
    // empty the box of every user whose engine has simply not been asked yet.
    if (model && after.sub.kind === 'model' && !has(after.sub.choices, model)) {
        dropped.push({
            field: 'model', value: model,
            why: providerId
                ? `${providerId} does not publish it`
                : 'the engine does not publish it'
        });
        delete next.model;
    }

    const variant = str(next.variant);
    if (variant) {
        const row = launchProviderForm(adapter, next, transport);
        if (!has(row.variants, variant)) {
            dropped.push({
                field: 'variant', value: variant,
                // ‼️ THE TRANSPORT'S REASON WHEN THAT IS THE REASON. "this model
                // publishes no variants" would be a lie about a model that
                // publishes three — what cannot carry them is the door it is
                // being started through.
                why: row.variantsWhy
                    || (row.variants.length
                        ? `this model publishes: ${row.variants.filter(c => c.id).map(c => c.id).join(', ')}`
                        : 'this model publishes no variants')
            });
            delete next.variant;
        }
    }
    return { pick: next, dropped };
}

/** The dropped values as one sentence for a toast — '' when nothing was dropped. */
export function describeDropped(dropped: readonly DroppedPick[]): string {
    if (!dropped.length) { return ''; }
    return dropped.map(d => `${d.field} “${d.value}” dropped — ${d.why}`).join(' · ');
}

/**
 * ‼️ WHAT "DEFAULT" MEANS ON THE PROVIDER ROW, IN WORDS — the item's clause
 * about showing Default's real value AND its source.
 *
 * The three answers a person can get here are genuinely different and the row
 * used to be able to say only the middle one:
 *
 *   · a route picked FOR THIS LAUNCH,
 *   · the agent's standing route (`agentEngineDefaults`), which is what runs
 *     when this launch says nothing,
 *   · and nothing at all — which does NOT mean "Anthropic", it means the child
 *     inherits whatever the shell carries, and that may be somebody else's
 *     endpoint from an hour ago.
 */
export function describeProviderChoice(
    form: ProviderForm, chosen: string | undefined, stored: string | undefined
): { value: string; origin: 'launch' | 'agent' | 'none'; note: string } {
    const label = (id: string): string =>
        form.providers.find(c => c.id === id)?.label || id;
    const c = str(chosen);
    if (c) { return { value: label(c), origin: 'launch', note: `chosen for this session — ${form.scopeNote}` }; }
    const s = str(stored);
    if (s) {
        return {
            value: label(s), origin: 'agent',
            note: `this agent's standing ${form.noun.toLowerCase()} (agentFarm.agentEngineDefaults)`
        };
    }
    return {
        value: 'none',
        origin: 'none',
        // ‼️ NOT "the default route". There is no such thing on this axis, and
        // naming one would be the single most misleading word on the form.
        note: 'nothing is injected and nothing is cleared — the session inherits whatever '
            + 'environment this window has, which may already name an endpoint'
    };
}

/**
 * A launch's provider pick as the adapter's own vocabulary, for `resolveRuntime`
 * and for a manifest. Empty fields are left OUT rather than sent as '' — an
 * absent answer and a chosen empty string are different things everywhere else
 * in this family and must not stop being different here.
 */
export function providerSelectionOf(engine: string, pick: ProviderPick): ProviderSelection {
    return {
        engine,
        ...(str(pick.providerId) ? { providerId: str(pick.providerId) } : {}),
        ...(str(pick.tier) ? { tier: str(pick.tier) } : {}),
        ...(str(pick.model) ? { modelId: str(pick.model) } : {}),
        ...(str(pick.variant) ? { variant: str(pick.variant) } : {})
    };
}
