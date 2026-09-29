import { createHmac, timingSafeEqual } from 'node:crypto';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { resolve } from '$app/paths';

// Everything below is signed with it, the admin session included. Checked at
// startup, like DATABASE_URL, rather than on the first sign-in.
if (!building && !env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not set');

/** How long one QR code stays on screen before it rotates. */
export const BUCKET_MS = 30_000;

/**
 * How long a guest has to finish after scanning. Decoupled from BUCKET_MS on
 * purpose: the code may rotate while they're still confirming.
 */
const PRESENCE_MS = 10 * 60_000;

/**
 * How long the link from a Moodle launch stays good for setting up a browser.
 * Room to open it in a new tab, or on the phone, and tap the button.
 */
export const ENROLLMENT_MS = 15 * 60_000;

function hmac(message: string) {
	// Checked at startup, so this only fires in `vite build`'s analysis pass —
	// signing a QR token with nothing is not a fallback.
	const secret = env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');

	return createHmac('sha256', secret).update(message).digest('base64url');
}

function equals(a: string, b: string) {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * The QR payload. Derived from the clock rather than stored, so it rotates by
 * itself, needs no cleanup, and — the point of a kiosk code — is usable by
 * everyone who scans it during its window.
 *
 * Names the admin showing it (`hostId`), so the first guest through checks
 * them in too — see `checkInHost`.
 */
export function bucketToken(hostId: string, at = Date.now()) {
	return `${hostId}.${hmac(`checkin:${hostId}:${Math.floor(at / BUCKET_MS)}`)}`;
}

/** Milliseconds until the on-screen code changes. */
export function msUntilNextBucket(at = Date.now()) {
	return BUCKET_MS - (at % BUCKET_MS);
}

/**
 * The admin showing the code, or null if it isn't ours. Accepts the current
 * bucket and the previous one, so a scan mid-rotation survives.
 */
export function verifyBucketToken(token: string, at = Date.now()) {
	const [hostId] = token.split('.');
	if (!hostId) return null;
	return equals(token, bucketToken(hostId, at)) ||
		equals(token, bucketToken(hostId, at - BUCKET_MS))
		? hostId
		: null;
}

/** Proof the holder scanned a live code, in a form that outlives one rotation. */
export function issuePresence(hostId: string, at = Date.now()) {
	const expiresAt = at + PRESENCE_MS;
	return `${hostId}.${expiresAt}.${hmac(`presence:${hostId}:${expiresAt}`)}`;
}

/** The admin whose code was scanned, or null if the presence is expired or not ours. */
export function verifyPresence(value: string | undefined, at = Date.now()) {
	return verifyExpiring('presence', value, at);
}

/**
 * A stable, non-secret handle for one scan, safe to store next to a check-in.
 * Truncated so the row can never be replayed as the presence token itself.
 */
export function scanId(value: string) {
	return value.split('.')[2].slice(0, 16);
}

/**
 * The handle for a code scanned inside the page a Moodle launch opened, rather
 * than with a set-up phone (see `scan` in `/lti-link/enroll`). There is no
 * presence cookie to take it from, so it is derived from the launch and the
 * code: the same scan submitted twice gets the same handle, and the unique
 * index collapses it, while two guests scanning the same code get different
 * ones. Truncated, like `scanId`, so it is no use as either token.
 */
export function launchScanId(enrollment: string, code: string) {
	return hmac(`launch-scan:${enrollment}:${code}`).slice(0, 16);
}

export type Enrollment = {
	userId: string;
	/** Only so the setup page can greet them; the server never reads it back. */
	firstName: string;
	issuedAt: number;
};

/**
 * Says "a Moodle launch just proved this is `userId`", for the setup page to
 * turn into a device key. Travels in the URL fragment, so it is never sent to
 * a server or logged, and one key set up after `issuedAt` spends it — see
 * `enroll` in `/lti-link/enroll`.
 */
export function issueEnrollment(enrollment: Omit<Enrollment, 'issuedAt'>, at = Date.now()) {
	const payload = Buffer.from(JSON.stringify({ ...enrollment, issuedAt: at })).toString(
		'base64url'
	);
	return `${payload}.${hmac(`enroll:${payload}`)}`;
}

/** What the enrollment says, or null if it is expired or not ours. */
export function verifyEnrollment(value: string | undefined, at = Date.now()) {
	if (!value) return null;
	const [payload, signature, extra] = value.split('.');
	if (!payload || !signature || extra !== undefined) return null;
	if (!equals(signature, hmac(`enroll:${payload}`))) return null;

	const enrollment: Enrollment = JSON.parse(Buffer.from(payload, 'base64url').toString());
	if (enrollment.issuedAt + ENROLLMENT_MS < at) return null;
	return enrollment;
}

/**
 * How long the handoff from an admin-tool launch stays good. Only needs room
 * for the page to load, or for one tap on "Continue in a new tab".
 */
const ADMIN_LAUNCH_MS = 5 * 60_000;

/**
 * How long an organizer stays signed in after launching the admin tool. A
 * working day at the door and then some; after that, they launch it again.
 * Not renewed by use: the platform decides who is an organizer, and one it
 * stops letting in should drop out within this, even with a screen left open.
 */
export const ADMIN_SESSION_MS = 24 * 60 * 60_000;

/**
 * Says "a launch of the admin tool just proved this is `userId`", for
 * `/lti-link/admin` to turn into a session cookie. It can't set the cookie
 * straight from the launch: inside the platform's frame, the cookie would be
 * a third-party one. Travels in the URL fragment, like the enrollment.
 */
export function issueAdminLaunch(userId: string, at = Date.now()) {
	const expiresAt = at + ADMIN_LAUNCH_MS;
	return `${userId}.${expiresAt}.${hmac(`admin-launch:${userId}:${expiresAt}`)}`;
}

/** The organizer the launch vouched for, or null if it is expired or not ours. */
export function verifyAdminLaunch(value: string | undefined, at = Date.now()) {
	return verifyExpiring('admin-launch', value, at);
}

/** The admin session cookie's value: who, and until when. */
export function issueAdminSession(userId: string, at = Date.now()) {
	const expiresAt = at + ADMIN_SESSION_MS;
	return `${userId}.${expiresAt}.${hmac(`admin-session:${userId}:${expiresAt}`)}`;
}

/** The signed-in organizer, or null if the session is expired or not ours. */
export function verifyAdminSession(value: string | undefined, at = Date.now()) {
	return verifyExpiring('admin-session', value, at);
}

/**
 * `<id>.<expiresAt>.<signature>`, for any of the tokens shaped that way. The
 * purpose is part of what is signed, so none of them passes for another.
 */
function verifyExpiring(purpose: string, value: string | undefined, at: number) {
	if (!value) return null;
	const [userId, expiresAt, signature, extra] = value.split('.');
	if (!userId || !expiresAt || !signature || extra !== undefined) return null;
	if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < at) return null;
	return equals(signature, hmac(`${purpose}:${userId}:${expiresAt}`)) ? userId : null;
}

export const ADMIN_SESSION_COOKIE = 'admin_session';

// Lax: the admin pages are only ever opened top-level (see /lti-link/admin),
// and a third-party frame couldn't keep the cookie anyway.
export const adminSessionCookieOptions = {
	path: resolve('/'),
	httpOnly: true,
	sameSite: 'lax',
	maxAge: ADMIN_SESSION_MS / 1000
} as const;

export const PRESENCE_COOKIE = 'checkin_presence';

// Lax, not strict: the scan arrives as a top-level navigation from the camera
// app, and strict would leave the cookie behind.
export const presenceCookieOptions = {
	path: resolve('/checkin'),
	httpOnly: true,
	sameSite: 'lax',
	maxAge: PRESENCE_MS / 1000
} as const;
