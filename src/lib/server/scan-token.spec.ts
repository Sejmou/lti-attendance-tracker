import { expect, test } from 'vitest';
import {
	ADMIN_SESSION_MS,
	BUCKET_MS,
	ENROLLMENT_MS,
	bucketToken,
	issueAdminLaunch,
	issueAdminSession,
	issueEnrollment,
	issuePresence,
	codeScanId,
	verifyAdminLaunch,
	verifyAdminSession,
	verifyBucketToken,
	verifyEnrollment,
	verifyPresence
} from './scan-token';

const OPS = { hostId: 'ops', eventId: 'party' };

test('a code is accepted for its own window and the one before it, and names its screen', () => {
	const now = Date.now();
	const token = bucketToken(OPS, now);

	expect(verifyBucketToken(token, now)).toEqual(OPS);
	// Scanned just before a rotation, submitted just after.
	expect(verifyBucketToken(token, now + BUCKET_MS)).toEqual(OPS);
});

test('a code is rejected two windows later', () => {
	const now = Date.now();
	expect(verifyBucketToken(bucketToken(OPS, now), now + 2 * BUCKET_MS)).toBeNull();
});

test('a made-up code is rejected', () => {
	expect(verifyBucketToken('not-a-real-token')).toBeNull();
	expect(verifyBucketToken('')).toBeNull();
	expect(verifyBucketToken('ops.x')).toBeNull();
});

test('a code cannot be moved to another host or another event', () => {
	const now = Date.now();
	const [, signature] = bucketToken(OPS, now).split('.');
	expect(verifyBucketToken(`grace:party.${signature}`, now)).toBeNull();
	expect(verifyBucketToken(`ops:lecture.${signature}`, now)).toBeNull();
});

test('the code changes when the window rolls over', () => {
	const now = Date.now();
	expect(bucketToken(OPS, now)).not.toBe(bucketToken(OPS, now + BUCKET_MS));
});

test('presence outlives several rotations but not its own expiry', () => {
	const now = Date.now();
	const presence = issuePresence(OPS, now);

	expect(verifyPresence(presence, now + 5 * BUCKET_MS)).toEqual(OPS);
	expect(verifyPresence(presence, now + 11 * 60_000)).toBeNull();
});

test('presence cannot be forged, tampered with or moved to another host or event', () => {
	const [, expiresAt, signature] = issuePresence(OPS).split('.');

	// Push the expiry out, keep the signature.
	expect(verifyPresence(`ops:party.${Number(expiresAt) + 60_000}.${signature}`)).toBeNull();
	expect(verifyPresence(`ops:party.${expiresAt}.deadbeef`)).toBeNull();
	expect(verifyPresence(`grace:party.${expiresAt}.${signature}`)).toBeNull();
	expect(verifyPresence(`ops:lecture.${expiresAt}.${signature}`)).toBeNull();
	expect(verifyPresence(undefined)).toBeNull();
	expect(verifyPresence('garbage')).toBeNull();
});

test('a scan gets a handle that is not the token', () => {
	const now = Date.now();
	const presence = issuePresence(OPS, now);

	// Two scans of the same displayed code still get their own handle.
	expect(codeScanId(presence)).not.toBe(codeScanId(issuePresence(OPS, now + 1)));
	expect(verifyPresence(codeScanId(presence), now)).toBeNull();
});

const ada = { userId: 'ada', firstName: 'Ada' };

test('an enrollment says who launched, for 15 minutes and no longer', () => {
	const now = Date.now();
	const token = issueEnrollment(ada, now);

	expect(verifyEnrollment(token, now + ENROLLMENT_MS - 1)).toEqual({ ...ada, issuedAt: now });
	expect(verifyEnrollment(token, now + ENROLLMENT_MS + 1)).toBeNull();
});

test('an enrollment cannot be moved to another attendee or stretched', () => {
	const now = Date.now();
	const [, signature] = issueEnrollment(ada, now).split('.');
	const forge = (fields: object) =>
		`${Buffer.from(JSON.stringify({ ...ada, issuedAt: now, ...fields })).toString('base64url')}.${signature}`;

	expect(verifyEnrollment(forge({ userId: 'grace' }), now)).toBeNull();
	expect(verifyEnrollment(forge({ issuedAt: now + 60_000 }), now)).toBeNull();
	expect(verifyEnrollment(undefined)).toBeNull();
	expect(verifyEnrollment('garbage')).toBeNull();
});

test('an enrollment and a presence never pass for each other', () => {
	const now = Date.now();
	expect(verifyPresence(issueEnrollment(ada, now), now)).toBeNull();
	expect(verifyEnrollment(issuePresence({ hostId: 'ada', eventId: 'party' }, now), now)).toBeNull();
});

test('an admin launch is good for a few minutes, then turned into nothing', () => {
	const now = Date.now();
	const launch = issueAdminLaunch('ops', now);
	expect(verifyAdminLaunch(launch, now + 60_000)).toBe('ops');
	expect(verifyAdminLaunch(launch, now + 10 * 60_000)).toBeNull();
});

test('an admin session lasts a day, and is not renewed by anything', () => {
	const now = Date.now();
	const session = issueAdminSession('ops', now);
	expect(verifyAdminSession(session, now + ADMIN_SESSION_MS - 1)).toBe('ops');
	expect(verifyAdminSession(session, now + ADMIN_SESSION_MS + 1)).toBeNull();
});

test('an admin session cannot be moved to someone else, or stretched', () => {
	const now = Date.now();
	const [, expiresAt, signature] = issueAdminSession('ops', now).split('.');
	expect(verifyAdminSession(`grace.${expiresAt}.${signature}`, now)).toBeNull();
	expect(verifyAdminSession(`ops.${Number(expiresAt) + 1}.${signature}`, now)).toBeNull();
});

test('presence, admin launches and admin sessions never pass for one another', () => {
	const now = Date.now();
	const presence = issuePresence(OPS, now);
	const launch = issueAdminLaunch('ops', now);

	// Same shape, different purpose: an attendee's presence cookie is no admin session.
	expect(verifyAdminSession(presence, now)).toBeNull();
	expect(verifyAdminLaunch(presence, now)).toBeNull();
	expect(verifyAdminSession(launch, now)).toBeNull();
	expect(verifyPresence(issueAdminSession('ops', now), now)).toBeNull();
});
