/**
 * X-105 — MAY THIS CONVERSATION CHANGE WHO SERVES IT, AND WHEN.
 *
 * X-98 wrote the difference between the two engines down as a single field
 * (`scope`), and X-103 drew it on the launcher. What was still missing is the
 * moment the field exists FOR: a session that is already running, and somebody
 * asking for a different provider inside it.
 *
 * The two engines answer differently, and both answers are correct:
 *
 *   · **Claude** — a route is base URL, auth and tier, injected into the child's
 *     environment before it is spawned. Changing it means a different program.
 *     Measured in August: resuming one session through a different route mixed
 *     two routes' models into a single transcript, and the transcript could not
 *     say which served which turn. So the change is REFUSED, and the refusal
 *     names the thing that does work — a fork, or a new session.
 *   · **OpenCode** — the provider is the engine's own identity and it publishes
 *     a way to change it (`session/set_config_option`). The change is legitimate
 *     and lands at the TURN BOUNDARY, where it is recorded as a new turn
 *     identity rather than rewriting what the earlier turns ran on.
 *
 * ‼️ AND NEITHER ANSWER IS SPELLED WITH AN ENGINE'S NAME. `if (engine ===
 * 'claude')` here would be the twentieth copy of a rule that already has one
 * home: the adapter states `providerScope` and
 * `canSwitchProviderAtTurnBoundary`, and this module asks those two. A sixth
 * engine gets the right answer by declaring itself, not by being added to a list
 * somebody has to remember to edit.
 *
 * ‼️ AND A REFUSAL IS RETURNED, NEVER SWALLOWED. The failure this exists to
 * prevent is the quiet one: a caller asks for a provider, something drops the
 * request, and the card goes on claiming the old one while the person believes
 * they moved. Every path out of here says which of the four things happened.
 *
 * Pure — no vscode, no I/O, no secrets.
 */

import { launchProviderForm, ProviderTransport } from './launchProvider';
import { ProviderAdapter } from './providerAdapter';
import { scopeAllowsTurnChange, splitQualifiedRef } from './providerIdentity';

/**
 * ‼️ FOUR ANSWERS, AND `unchanged` IS ONE OF THEM. A request that names the
 * provider the session is already on is not a success and not a failure — it is
 * a no-op, and a caller told "applied" would have no way to tell it apart from a
 * move that really happened.
 */
export type SwitchAct =
    /** The provider is not moving — nothing was asked, or what was asked is
     *  already true. Whatever else the caller was doing still applies. */
    | 'unchanged'
    /** It moves, and it is in force from here. */
    | 'now'
    /** It moves at the end of the turn that is running, and is recorded as a new
     *  turn identity. The engine offers no way to change a turn already under
     *  way, and applying one anyway is how an answer changes model halfway. */
    | 'turn-boundary'
    /** It does not move. `remedy` says what does. */
    | 'refuse';

export interface SwitchVerdict {
    act: SwitchAct;
    /** The provider the session is on AFTER this — unchanged on a refusal, so a
     *  caller can write it down without re-deriving which branch it took. */
    providerId: string;
    /** One sentence a person can read. Always present: an act with no reason is
     *  what makes a refusal look like a bug. */
    why: string;
    /**
     * ‼️ ONLY ON `refuse`, AND IT IS THE POINT OF THE REFUSAL. The item's own
     * words are "forbidden in the same conversation, ask for new/fork" — a no
     * with nothing after it would leave a caller with no way to get what it
     * wanted at all. `fork` when there is a conversation worth keeping, `new`
     * when there is not.
     */
    remedy?: 'fork' | 'new';
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** What the session runs on today, in as much of it as the caller has. */
export interface SwitchCurrent {
    providerId?: string;
    /** The engine's wire spelling of the model — `provider/model` where the
     *  engine qualifies it, the bare name where it does not. */
    modelRef?: string;
}

/** What is being asked for. `model` is here because on one engine it CARRIES the
 *  provider: `opencode/big-pickle` names both, and a switch asked for that way
 *  is the same switch. */
export interface SwitchRequest {
    providerId?: string;
    tier?: string;
    model?: string;
}

export interface SwitchState {
    /** Is a turn under way right now? Decides `now` vs `turn-boundary`, and
     *  nothing else. */
    turnRunning: boolean;
    /**
     * Is there a conversation to carry over — a session id the engine could be
     * resumed on? Decides which remedy a refusal names. A card that never got an
     * id has nothing to fork FROM, and telling somebody to fork it would send
     * them at a door that cannot open.
     */
    resumable?: boolean;
}

/**
 * ‼️ THE PROVIDER HALF OF A WIRE-QUALIFIED MODEL, AND ONLY WHERE THE ENGINE
 * VOUCHES FOR IT. `splitQualifiedRef` refuses to call a prefix a provider unless
 * it is on the engine's own published list, which is the same anti-guess rule
 * `opencode.ts` already carries a scar from breaking.
 */
export function providerOfModelRef(
    adapter: ProviderAdapter, modelRef: string | undefined, transport: ProviderTransport = 'acp'
): string {
    if (adapter.axis !== 'provider') { return ''; }
    const known = launchProviderForm(adapter, {}, transport).providers
        .map(c => str(c.id)).filter(Boolean);
    return splitQualifiedRef(str(modelRef), known).providerId;
}

/**
 * The verdict for one live session and one request.
 *
 * Called by every door that can change a running card's provider, so the
 * Console, the bridge and (later) the resume gate cannot come to different
 * conclusions about the same engine.
 */
export function providerSwitchPolicy(
    adapter: ProviderAdapter,
    current: SwitchCurrent,
    requested: SwitchRequest,
    state: SwitchState = { turnRunning: false },
    transport: ProviderTransport = 'acp'
): SwitchVerdict {
    const now = str(current.providerId);

    // ‼️ AN ENGINE WITH NO PROVIDER AXIS IS ANSWERED, NOT EXCUSED. Three of the
    // five are in this state, and a request naming a provider for one of them is
    // the Claude-shaped field riding along on a Gemini run (X-98) — refused by
    // name rather than dropped, because a caller that asked for an endpoint and
    // got silence cannot tell it apart from success.
    if (adapter.axis !== 'provider') {
        const named = str(requested.providerId);
        return named
            ? {
                act: 'refuse', providerId: '',
                why: `${adapter.engine} has no provider axis — there is nothing here to switch.`
            }
            : { act: 'unchanged', providerId: '', why: `${adapter.engine} has no provider axis.` };
    }

    const form = launchProviderForm(adapter, { providerId: str(requested.providerId) || now }, transport);
    const known = form.providers.map(c => str(c.id)).filter(Boolean);
    const noun = form.noun.toLowerCase() || 'provider';

    // The model may be the thing that names it — see SwitchRequest.model.
    const want = str(requested.providerId)
        || splitQualifiedRef(str(requested.model), known).providerId;

    if (!want || want === now) {
        return {
            act: 'unchanged', providerId: now,
            why: want
                ? `already on the "${want}" ${noun}.`
                : `no ${noun} was asked for, so the session keeps the one it started on.`
        };
    }

    // ‼️ THE ADAPTER'S OWN WORD FOR "I RECOGNISE THIS". `known` is built by
    // `runnableProviders`, which filters through `normalizeSelection` — so an id
    // that is a template rather than a profile, or belongs to another engine, is
    // refused here rather than resolving to `unknown` identity and injecting
    // nothing while the card says otherwise.
    if (!known.includes(want)) {
        return {
            act: 'refuse', providerId: now,
            why: known.length
                ? `"${want}" is not a ${noun} ${adapter.engine} can be pointed at here — one of: ${known.join(', ')}.`
                : `"${want}" is not a ${noun} ${adapter.engine} can be pointed at here — ${form.empty || 'nothing is on offer'}.`
        };
    }

    /**
     * ‼️ BOTH FACTS ARE ASKED, AND THEY ARE NOT THE SAME FACT. `scope` says how
     * long an identity is meant to last; `canSwitchProviderAtTurnBoundary` says
     * whether the engine publishes a mechanism to move it. A turn-scoped engine
     * with no mechanism would otherwise be told yes and then quietly do nothing,
     * which is the failure mode this whole module exists to make impossible.
     */
    if (!scopeAllowsTurnChange(form.scope)) {
        return {
            act: 'refuse', providerId: now,
            remedy: state.resumable ? 'fork' : 'new',
            why: now
                ? `this session runs on the "${now}" ${noun}, and on ${adapter.engine} that is fixed for the `
                    + 'session — a different one is a different program, not a continuation. '
                    + (state.resumable
                        ? 'Fork it onto the new one, or start a new session; the transcript stays readable either way.'
                        : 'Start a new session on it.')
                : `${adapter.engine} fixes the ${noun} for the whole session, so one cannot be introduced `
                    + 'part way through. ' + (state.resumable
                        ? 'Fork it onto that route, or start a new session on it.'
                        : 'Start a new session on it.')
        };
    }
    if (!adapter.canSwitchProviderAtTurnBoundary) {
        return {
            act: 'refuse', providerId: now,
            remedy: state.resumable ? 'fork' : 'new',
            why: `${adapter.engine} publishes no way to change the ${noun} of a running session.`
        };
    }

    return state.turnRunning
        ? {
            act: 'turn-boundary', providerId: want,
            why: `the ${noun} becomes "${want}" when this turn ends — ${adapter.engine} cannot change the `
                + `${noun} of a turn that is running, and the change is recorded as a new turn identity `
                + 'rather than rewriting what the earlier turns ran on.'
        }
        : {
            act: 'now', providerId: want,
            why: `the ${noun} is "${want}" from the next turn, recorded as a new turn identity — `
                + 'the turns before it keep the one they ran on.'
        };
}
