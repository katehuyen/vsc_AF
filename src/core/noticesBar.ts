/**
 * U-221 — THE NOTICES MARK IN THE STATUS BAR SAYS WHEN A QUESTION IS WAITING
 * THAT YOU HAVE NOT EVEN OPENED.
 *
 * The plain bell (and its dot, and the aging warning) reads the same for an
 * update nobody needs to act on and for an agent stopped on a question. A
 * question you have not opened is the one notice that holds work up, so while
 * one exists the mark becomes the question category's own icon - the Notices
 * page's `❓`, an emoji, so it keeps its red in any theme where a codicon could
 * only take the bar's foreground.
 */

import type { Notice } from './notices';

/** The Notices page's icon for the question category (media/notices.js TYPE.question). */
export const QUESTION_MARK = '❓';

/** Questions still open that the user has never opened. */
export function unseenQuestionCount(list: readonly Pick<Notice, 'type' | 'read' | 'status'>[]): number {
    return list.reduce((a, n) => a + (n.type === 'question' && !n.read && (n.status ?? 'open') === 'open' ? 1 : 0), 0);
}

/** The bar's text: an unseen question first, then the aging warning, then the bell. */
export function noticesBarText(o: { count: number; aging: number; unseenQuestions: number }): string {
    if (o.unseenQuestions > 0) { return `${QUESTION_MARK} ${o.count || o.unseenQuestions}`; }
    if (o.aging > 0) { return `$(warning) ${o.count || o.aging}`; }
    return o.count > 0 ? `$(bell-dot) ${o.count}` : '$(bell)';
}
