/**
 * U-178 — THE SOUND CONTROLS' PRESSES, ANSWERED IN ONE PLACE.
 *
 * The Sound page draws the alert controls and the Settings page used to; both
 * post the same messages. Two switches answering them is how one page comes to
 * store what the other refuses (X-305's lesson), so the arms live here and each
 * panel hands in the two things that differ: where a refusal is shown, and how
 * it redraws itself.
 *
 * ‼️ EVERY ARM CALLS THE FUNCTION THE MATCHING `alerts.*` OP CALLS. The page
 * holds no rule of its own about reserved ids, the limit of ten, or which
 * formats play.
 */
import { AlertsPage, NOTIFY_KEYS } from './soundModel';

/** The host acts the sound controls need — each one the function an op runs. */
export interface AlertMessageDeps {
    /**
     * ‼️ A-21 — THE ALERT SOUNDS, RESOLVED RATHER THAN PRINTED.
     *
     * Third time for the lesson the wiki root and the Superpowers folder each
     * cost a week: `agentFarm.alerts.voices` is an object that is EMPTY out of
     * the box, so the two JSON boxes this card replaces showed `{}` for a
     * feature that already plays five different sounds. What a person wants
     * from this page is "which sound will I hear, and why that one" — which
     * only the resolution chain can answer, so the host hands the answer over
     * and the boxes are gone rather than merely decorated.
     */
    alerts?(): AlertsPage | null;
    /** Every write and every ▶ goes back to the host, because each one is the
     *  same act as an `alerts.*` bridge op and they share the function. */
    alertsSetOn?(event: string, on: boolean): Promise<void>;
    alertsSetVoice?(event: string, voice: string): Promise<void>;
    /** A-22 — the gate. The same two functions the status bar and the
     *  `alerts.mute` / `alerts.quiet` ops go through. */
    alertsSetMuted?(on: boolean): Promise<void>;
    alertsSetQuiet?(patch: { on?: boolean; from?: string; to?: string }): Promise<void>;
    /** U-123 — the nudge's three fields, through the same host function
     *  `alerts.nudge` uses. Only what changed is sent; the rest keeps its value. */
    alertsSetNudge?(patch: { minutes?: number; repeat?: number; voice?: string }): Promise<void>;
    /** Unmute ONE session from the card that listed it as muted — the row says
     *  which conversation is quiet, so it has to be able to undo it. */
    alertsUnmuteSession?(sessionId: string): Promise<void>;
    /** Play one voice by id — "what does this one sound like". Named after the
     *  host function it is wired to, so the parity gate can SEE that the ▶ and
     *  `alerts.play` are the same act rather than two implementations. */
    alertsPlayVoice?(voice: string): Promise<void>;
    /** Add / rename / drop one of the user's own sounds. `add` opens the file
     *  picker itself: the host owns the dialog, the page owns the gesture. */
    alertsVoiceAdd?(): Promise<void>;
    alertsVoiceRename?(id: string, label: string): Promise<void>;
    alertsVoiceRemove?(id: string): Promise<void>;
    /** Open (creating if need be) the folder the card suggests sounds go in. */
    alertsOpenFolder?(): Promise<void>;
    /**
     * ‼️ A-25 — THE ANNOUNCEMENT'S OWN CONTROLS, through the same host
     * functions `alerts.speak` uses. `agentFarm.alerts.speak` is a seven-field
     * object and was a raw JSON box: one of those fields is a voice NAME that
     * has to exist on THIS machine, and a box cannot know whether it does.
     */
    alertsSetSpeak?(patch: Record<string, unknown>): Promise<void>;
    alertsSetSpeakEvent?(event: string, on: boolean): Promise<void>;
    /** Speak something RIGHT NOW, gate and queue bypassed — "does this machine
     *  talk at all" is not the same question as "is the feature on". */
    alertsSpeakTest?(text?: string): Promise<void>;
    /** Ask the machine which voices it has. Costs a shell, so the page asks
     *  once and the host keeps the answer; `force` is the reader who has just
     *  installed a language pack and wants it in the list now. */
    alertsLoadSpeechVoices?(force?: boolean): Promise<void>;
    /** Clear ONE conversation's own announcement voice, from the strip that
     *  listed it — the same act as `alerts.speak { sessionId, voice: '' }`. */
    alertsClearSessionSpeech?(sessionId: string): Promise<void>;
    /** U-178 — the Notification column: the VS Code notification for one event,
     *  written through the function `settings.set` writes with. */
    alertsSetNotify?(event: string, on: boolean): Promise<void>;
}

/** Where a refusal lands on a page — the key its error line is drawn under. */
export const ALERT_ERROR_KEY = 'agentFarm.alerts.voices';

/** What differs per page. */
export interface AlertSurface {
    /** show a refusal against the controls (`{ type: 'error', key: ALERT_ERROR_KEY }`) */
    error(text: string): void;
    /** redraw the page from its data */
    refresh(): void;
}

/**
 * Answer one message from the sound controls. Returns true when the message
 * was theirs, so the panel's own switch sees only what is left.
 *
 * ‼️ A-21 — A REFUSED SOUND IS SHOWN, NOT SWALLOWED. Every rule the host
 * enforces comes back as a sentence the user can act on; silence would be
 * indistinguishable from the alert simply being off. And every write redraws:
 * the row's resolved sound changes with it, so the page is never left showing
 * the state before the click.
 */
export async function handleAlertMessage(
    msg: { type: string;[k: string]: unknown },
    deps: AlertMessageDeps,
    surface: AlertSurface
): Promise<boolean> {
    const alertError = (error: string): void => surface.error(error.slice(0, 300));
    const alertAct = async (run: () => Promise<void> | undefined): Promise<void> => {
        try { await run(); surface.refresh(); }
        catch (e) { alertError(String((e as Error).message)); }
    };
    switch (msg.type) {
        /**
         * ‼️ A-21 — THE ALERT SOUNDS CARD. Every one of these is the same
         * act as an `alerts.*` bridge op and goes through the same host
         * function; the page holds no rule of its own about reserved ids,
         * the limit of ten, or which formats play.
         *
         * Every refusal is SHOWN, on the card, against the control that
         * caused it — a sound feature that fails silently is
         * indistinguishable from one that is merely switched off, which is
         * the whole failure mode A-18 was opened for.
         */
        case 'alertOn':
            await alertAct(() =>
                deps.alertsSetOn?.(String(msg.event ?? ''), msg.on !== false));
            return true;
        case 'alertVoice':
            await alertAct(() =>
                deps.alertsSetVoice?.(String(msg.event ?? ''), String(msg.voice ?? '')));
            return true;
        // A-22 — the gate. A refused quiet window (a time that is not
        // HH:MM) comes back through the same `alertError` channel and is
        // shown against the card, because a schedule that reads as
        // configured and silences nothing is the worst of the outcomes.
        case 'alertMute':
            await alertAct(() => deps.alertsSetMuted?.(msg.on !== false));
            return true;
        case 'alertQuiet':
            await alertAct(() => deps.alertsSetQuiet?.({
                ...(msg.on === undefined ? {} : { on: msg.on !== false }),
                ...(msg.from === undefined ? {} : { from: String(msg.from) }),
                ...(msg.to === undefined ? {} : { to: String(msg.to) })
            }));
            return true;
        /**
         * ‼️ U-123 — THE NUDGE'S THREE FIELDS, one message, exactly like the
         * quiet hours above it. The page sends only what it changed; the
         * host keeps the rest and clamps what it is given, so a number a
         * box should never have produced is never stored.
         *
         * `on: false` is `minutes: 0` — the setting's own way of saying off,
         * rather than a fourth field that could disagree with the other
         * three. Switching it back on with the numbers still at zero would
         * arm nothing, so the defaults answer for whichever half is empty.
         */
        case 'alertNudge': {
            const patch: { minutes?: number; repeat?: number; voice?: string } = {};
            if (msg.on !== undefined) {
                if (msg.on === false) {
                    patch.minutes = 0;
                } else {
                    patch.minutes = Number(msg.minutes) || 0;
                    patch.repeat = Number(msg.repeat) || 0;
                }
            }
            if (msg.minutes !== undefined && msg.on === undefined) {
                patch.minutes = Number(msg.minutes);
            }
            if (msg.repeat !== undefined && msg.on === undefined) {
                patch.repeat = Number(msg.repeat);
            }
            if (msg.voice !== undefined) { patch.voice = String(msg.voice); }
            await alertAct(() => deps.alertsSetNudge?.(patch));
            return true;
        }
        case 'alertUnmuteSession':
            await alertAct(() =>
                deps.alertsUnmuteSession?.(String(msg.sessionId ?? '')));
            return true;
        // ▶ — plays and changes nothing, so the page is NOT redrawn: a
        // redraw under the hand would close the picker the reader just
        // opened to compare two tones.
        case 'alertPlay':
            try { await deps.alertsPlayVoice?.(String(msg.voice ?? '')); }
            catch (e) { alertError(String((e as Error).message)); }
            return true;
        case 'alertVoiceAdd':
            await alertAct(() => deps.alertsVoiceAdd?.());
            return true;
        case 'alertVoiceRename': {
            const id = String(msg.id ?? '').trim();
            const label = String(msg.label ?? '').trim();
            if (!id || !label) { return true; }
            await alertAct(() => deps.alertsVoiceRename?.(id, label));
            return true;
        }
        case 'alertVoiceRemove': {
            const id = String(msg.id ?? '').trim();
            if (!id) { return true; }
            await alertAct(() => deps.alertsVoiceRemove?.(id));
            return true;
        }
        /**
         * ‼️ A-25 — EVERY FLEET-WIDE WRITE ON THE ANNOUNCEMENT STRIP, one
         * message. The page sends only the fields it changed and the host
         * merges them through `speakConfig`, so a rate the box should never
         * have produced is clamped rather than stored.
         */
        case 'alertSpeak': {
            const patch: Record<string, unknown> = {};
            for (const k of ['on', 'template', 'rate', 'volume', 'voice']) {
                if (msg[k] !== undefined) { patch[k] = msg[k]; }
            }
            if (msg.event !== undefined) {
                await alertAct(() =>
                    deps.alertsSetSpeakEvent?.(String(msg.event), msg.on !== false));
                return true;
            }
            await alertAct(() => deps.alertsSetSpeak?.(patch));
            return true;
        }
        case 'alertSpeakTest':
            // Not through `alertAct`: speaking changes no setting, so the
            // redraw it would trigger is a page that flickers for nothing.
            try {
                await deps.alertsSpeakTest?.(
                    msg.text === undefined ? undefined : String(msg.text));
            } catch (e) { alertError(String((e as Error).message)); }
            return true;
        case 'alertSpeakVoices':
            await alertAct(() =>
                deps.alertsLoadSpeechVoices?.(msg.force === true));
            return true;
        case 'alertSpeakSession':
            await alertAct(() =>
                deps.alertsClearSessionSpeech?.(String(msg.sessionId ?? '')));
            return true;
        case 'alertFolder':
            await alertAct(() => deps.alertsOpenFolder?.());
            return true;
        case 'alertNotify': {
            const event = String(msg.event ?? '');
            if (!NOTIFY_KEYS[event]) { return true; }
            await alertAct(() => deps.alertsSetNotify?.(event, msg.on !== false));
            return true;
        }
    }
    return false;
}
