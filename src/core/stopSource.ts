/**
 * ‼️ X-480 — WHO ASKED A TURN TO STOP, said on the row that closes it.
 *
 * Every stop Agent Farm can send goes through one writer
 * (`ConsoleHost.interrupt`), and yet nothing remembered which surface had
 * called it: an empty interrupt receipt is silent by design, so a turn that
 * ended "interrupted" read the same whether a person pressed Esc, a phone's
 * ⎋ was tapped, an agent called the bridge — or nobody asked at all and the
 * engine ended it by itself. Measured 2026-10-02 20:00:05 UTC: a revived relay
 * leg's nudge turn was cut two seconds in, the leg sat idle, the chain stalled,
 * and the records could not say which of those it was.
 *
 * So the surface travels with the request, the closing row names it, and a turn
 * the engine reports as interrupted with no request on record says THAT — the
 * one case that points outside Agent Farm. Pure; the words are the product's
 * (English, like every card line).
 */

/** The surface a stop was asked from — one per door that can reach `ConsoleHost.interrupt`. */
export type StopFrom =
    | 'console-esc' | 'console-button'
    | 'phone-esc' | 'phone-button'
    | 'card-menu' | 'command' | 'bridge' | 'telegram';

const WORDS: Record<StopFrom, string> = {
    'console-esc': 'stopped from the Console (Esc)',
    'console-button': 'stopped from the Console (⎋ button)',
    'phone-esc': 'stopped from the phone (Esc)',
    'phone-button': 'stopped from the phone (⎋ button)',
    'card-menu': 'stopped from the card\'s menu (Interrupt Turn)',
    'command': 'stopped by the Interrupt command',
    'bridge': 'stopped through the bridge (an agent or a script)',
    'telegram': 'stopped from Telegram'
};

/** What a turn the engine ended as interrupted says when no stop was asked for it. */
export const NO_STOP_ASKED = 'nothing in Agent Farm asked it to stop — the engine ended it itself';

/** The words for a stop's surface; an unnamed caller is said to be one rather than guessed. */
export function stopWords(from: StopFrom | undefined): string {
    return (from && WORDS[from]) || 'stopped by an unnamed caller';
}
