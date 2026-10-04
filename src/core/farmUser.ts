/**
 * X-489 — WHOSE A NOTICE IS. A farm has one user today; Notices carry the field
 * anyway, like the phone's devices and event stream, so a team licence needs no
 * migration. A record written before the field reads as the owner's. The remote
 * module spells the same owner in src/remote/server/devices.ts, since it imports
 * nothing outside itself (X-448); test_record_user.js holds the two equal.
 */
export const OWNER = 'owner';

export const userOf = (v: unknown): string => (typeof v === 'string' && v ? v : OWNER);
