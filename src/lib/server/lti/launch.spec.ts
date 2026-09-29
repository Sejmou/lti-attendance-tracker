import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { desc, eq, like } from 'drizzle-orm';
import { IdTokenValidationMethod } from 'ltijs';
import { env } from '$env/dynamic/private';
import { enrollMessage, scanMessage } from '$lib/device-key';
import { actions } from '../../../routes/lti-link/enroll/+page.server';
import { actions as adminActions } from '../../../routes/lti-link/admin/+page.server';
import { db } from '../db';
import { deviceKey, ltiPlatform, ltiRegistration, scan as scanRow, user } from '../db/schema';
import { verifySignature } from '../device-key';
import {
	ADMIN_SESSION_COOKIE,
	BUCKET_MS,
	bucketToken,
	ENROLLMENT_MS,
	issueEnrollment,
	verifyAdminLaunch,
	verifyAdminSession,
	verifyEnrollment
} from '../scan-token';
import { httpHandler, provider } from './provider';

// Plays Moodle: a platform key pair, and the forms Moodle's pages would post.
const MOODLE = 'https://moodle.test';
const CLIENT_ID = 'attendance-tool';
const ADMIN_CLIENT_ID = 'attendance-admin-tool';
/** Registered with ltijs, the way sites were before pairs, but in no pair. */
const LONE_CLIENT_ID = 'attendance-lone-tool';
const TOOL = 'http://localhost:5173/lti-link';
const ATTENDEE = 'lti-attendee@example.com';
const ADA = JSON.stringify([MOODLE, '42']);
const platformKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });

beforeAll(async () => {
	// See auth.spec.ts.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	db.delete(ltiPlatform).where(eq(ltiPlatform.url, MOODLE)).run();
	db.delete(ltiRegistration).where(eq(ltiRegistration.url, MOODLE)).run();
	db.delete(user)
		.where(like(user.ltiSubject, `["${MOODLE}"%`))
		.run();

	for (const clientId of [CLIENT_ID, ADMIN_CLIENT_ID, LONE_CLIENT_ID]) {
		await provider.platformManager.registerPlatform({
			name: 'Moodle',
			url: MOODLE,
			clientId,
			authenticationEndpoint: `${MOODLE}/mod/lti/auth.php`,
			accessTokenEndpoint: `${MOODLE}/mod/lti/token.php`,
			idTokenValidation: {
				method: IdTokenValidationMethod.RsaKey,
				key: platformKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
			}
		});
	}
	db.insert(ltiRegistration)
		.values({ url: MOODLE, adminClientId: ADMIN_CLIENT_ID, attendeeClientId: CLIENT_ID })
		.run();
});

function post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
	const request = new Request(`${TOOL}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
		body: new URLSearchParams(fields)
	});
	return httpHandler.handle({ request, url: new URL(request.url) } as never, path);
}

/** Moodle's login initiation, then the state ltijs hands the browser to keep. */
async function login(clientId: string) {
	const response = await post('/login', {
		iss: MOODLE,
		client_id: clientId,
		login_hint: '42',
		target_link_uri: `${TOOL}/launch`
	});
	expect(response?.status).toBe(200);
	const html = await response!.text();
	const data = JSON.parse(html.match(/id="ltijs-login-data">(.*?)<\/script>/s)![1]);
	return {
		state: data.state as string,
		recoveryToken: data.recoveryToken as string,
		nonce: new URL(data.targetUrl).searchParams.get('nonce')!
	};
}

function idToken(nonce: string, claims: Record<string, unknown> = {}) {
	const now = Math.floor(Date.now() / 1000);
	const lti = 'https://purl.imsglobal.org/spec/lti/claim';
	const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const body = `${segment({ alg: 'RS256', typ: 'JWT', kid: 'moodle' })}.${segment({
		iss: MOODLE,
		sub: '42',
		aud: CLIENT_ID,
		iat: now,
		exp: now + 60,
		nonce,
		email: 'LTI-Attendee@example.com',
		given_name: 'Ada',
		family_name: 'Lovelace',
		[`${lti}/version`]: '1.3.0',
		[`${lti}/deployment_id`]: '1',
		[`${lti}/roles`]: [],
		[`${lti}/message_type`]: 'LtiResourceLinkRequest',
		[`${lti}/target_link_uri`]: `${TOOL}/launch`,
		[`${lti}/resource_link`]: { id: 'attendance' },
		...claims
	})}`;
	const signature = createSign('RSA-SHA256').update(body).sign(platformKeys.privateKey);
	return `${body}.${signature.toString('base64url')}`;
}

/**
 * The whole launch, as Moodle and ltijs's own pages would drive it — of the
 * attendee tool unless the claims say another (`aud`).
 */
async function launch(claims: Record<string, unknown> = {}) {
	const clientId = (claims.aud as string | undefined) ?? CLIENT_ID;
	const { state, recoveryToken, nonce } = await login(clientId);
	const id_token = idToken(nonce, claims);

	// Moodle's cross-origin post: ltijs answers with a page that fetches the
	// state back out of the browser's storage...
	const first = await post('/launch', { id_token, state }, { 'sec-fetch-site': 'cross-site' });
	expect(await first!.text()).toContain('ltijs_recovered_state');

	// ...and posts it back from our own origin.
	return post(
		'/launch',
		{ id_token, state, ltijs_recovered_state: recoveryToken },
		{ 'sec-fetch-site': 'same-origin' }
	);
}

async function enroll(token: string) {
	const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
		'sign',
		'verify'
	]);
	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		pair.privateKey,
		new TextEncoder().encode(enrollMessage(token))
	);
	const request = new Request('http://localhost:5173/lti-link/enroll?/enroll', {
		method: 'POST',
		body: new URLSearchParams({
			token,
			publicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey)),
			signature: Buffer.from(signature).toString('base64url')
		})
	});
	return { privateKey: pair.privateKey, result: await actions.enroll({ request } as never) };
}

function tokenFrom(response: Response | null) {
	expect(response?.status).toBe(303);
	const location = new URL(response!.headers.get('location')!, TOOL);
	expect(location.pathname).toBe('/lti-link/enroll');
	return location.hash.slice(1);
}

const attendee = () => db.select().from(user).where(eq(user.ltiSubject, ADA)).get();

test('a first launch creates the attendee from what Moodle says about them', async () => {
	const enrollment = verifyEnrollment(tokenFrom(await launch()));

	expect(attendee()).toMatchObject({
		email: ATTENDEE,
		firstName: 'Ada',
		lastName: 'Lovelace'
	});
	expect(enrollment).toMatchObject({ userId: attendee()!.id, firstName: 'Ada' });
});

test('later launches find the same attendee by Moodle account, whatever the email says now', async () => {
	const { id } = attendee()!;
	const enrollment = verifyEnrollment(tokenFrom(await launch({ email: 'ada@new.example' })));

	expect(enrollment?.userId).toBe(id);
	expect(await db.$count(user, eq(user.ltiSubject, ADA))).toBe(1);
});

test('an id_token is good for one launch', async () => {
	const { state, recoveryToken, nonce } = await login(CLIENT_ID);
	const fields = { id_token: idToken(nonce), state, ltijs_recovered_state: recoveryToken };

	expect((await post('/launch', fields, { 'sec-fetch-site': 'same-origin' }))?.status).toBe(303);
	expect((await post('/launch', fields, { 'sec-fetch-site': 'same-origin' }))?.status).toBe(400);
});

test('an id_token not signed by the platform is turned down', async () => {
	const { state, recoveryToken, nonce } = await login(CLIENT_ID);
	const [header, payload] = idToken(nonce).split('.');
	const forged = `${header}.${payload}.${Buffer.from('nope').toString('base64url')}`;

	const response = await post(
		'/launch',
		{ id_token: forged, state, ltijs_recovered_state: recoveryToken },
		{ 'sec-fetch-site': 'same-origin' }
	);
	// A 500, not a 400: ltijs lets jsonwebtoken's own error through, and its
	// Express handler answers that with a 500 too. What matters is no redirect.
	expect(response?.status).toBeGreaterThanOrEqual(400);
	expect(response?.headers.get('location')).toBeNull();
});

test('a new attendee Moodle shares no email or name for is told so, and not created', async () => {
	for (const missing of [{ email: undefined }, { given_name: undefined }, { family_name: '' }]) {
		const response = await launch({ sub: 'private', ...missing });
		expect(response?.headers.get('location')).toBe('/lti-link/enroll?problem=no-profile');
	}
	expect(await db.$count(user, eq(user.ltiSubject, JSON.stringify([MOODLE, 'private'])))).toBe(0);
});

test('an email some other account already has is no reason to turn anyone away', async () => {
	// Ada's address, on a second Moodle account: a person of its own, not Ada.
	const response = await launch({ sub: '666' });
	expect(verifyEnrollment(tokenFrom(response))?.userId).not.toBe(attendee()!.id);
	expect(await db.$count(user, eq(user.email, ATTENDEE))).toBe(2);
});

test("a launch of a tool that is in no registered pair isn't let in as anything", async () => {
	const response = await launch({ aud: LONE_CLIENT_ID });
	expect(response?.headers.get('location')).toBe('/lti-link/enroll?problem=unknown-tool');
});

test('the admin tool signs the same person in as an organizer, not an attendee to set up', async () => {
	const response = await launch({ aud: ADMIN_CLIENT_ID });
	expect(response?.status).toBe(303);
	const location = new URL(response!.headers.get('location')!, TOOL);
	expect(location.pathname).toBe('/lti-link/admin');

	const token = location.hash.slice(1);
	expect(verifyAdminLaunch(token)).toBe(attendee()!.id);
	// Only the attendee tool's token sets up a phone, and only the admin tool's signs in.
	expect(verifyEnrollment(token)).toBeNull();
	expect(verifyAdminLaunch(tokenFrom(await launch()))).toBeNull();

	const set = new Map<string, string>();
	const cookies = { set: (name: string, value: string) => set.set(name, value) };
	const signIn = (value: string) =>
		adminActions.signIn({
			cookies,
			request: new Request(`${TOOL}/admin?/signIn`, {
				method: 'POST',
				body: new URLSearchParams({ token: value })
			})
		} as never);

	expect(await signIn('forged')).toMatchObject({ status: 403 });
	expect(set.size).toBe(0);

	// Signing in answers with a redirect to /admin, which SvelteKit throws.
	await expect(signIn(token)).rejects.toMatchObject({ status: 303, location: '/admin' });
	expect(verifyAdminSession(set.get(ADMIN_SESSION_COOKIE))).toBe(attendee()!.id);
});

test("setting up stores a key that then signs the attendee's scans, once per launch", async () => {
	const token = tokenFrom(await launch());
	const { privateKey, result } = await enroll(token);
	expect(result).toMatchObject({ keyId: expect.any(String) });

	const stored = db.select().from(deviceKey).where(eq(deviceKey.userId, attendee()!.id)).get()!;
	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		privateKey,
		new TextEncoder().encode(scanMessage('scan-1'))
	);
	const signed = Buffer.from(signature).toString('base64url');
	expect(verifySignature(stored.publicKey, scanMessage('scan-1'), signed)).toBe(true);
	// Bound to its scan: no good for the next one.
	expect(verifySignature(stored.publicKey, scanMessage('scan-2'), signed)).toBe(false);

	// The same link again is spent.
	expect((await enroll(token)).result).toMatchObject({ status: 403 });
});

test('setting up again replaces the key, and the old one stops working', async () => {
	await enroll(tokenFrom(await launch()));
	const before = db.select().from(deviceKey).where(eq(deviceKey.userId, attendee()!.id)).get()!;

	await enroll(tokenFrom(await launch()));
	const after = db.select().from(deviceKey).where(eq(deviceKey.userId, attendee()!.id)).get()!;
	expect(after.id).not.toBe(before.id);
	expect(await db.$count(deviceKey, eq(deviceKey.id, before.id))).toBe(0);
});

test('a public key without proof of its private half is refused', async () => {
	const token = tokenFrom(await launch());
	const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign'
	]);
	const request = new Request('http://localhost:5173/lti-link/enroll?/enroll', {
		method: 'POST',
		body: new URLSearchParams({
			token,
			publicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey)),
			signature: Buffer.from('not a signature').toString('base64url')
		})
	});
	expect(await actions.enroll({ request } as never)).toMatchObject({ status: 400 });
});

/** The page's `scan` action: the launch's token, and what the camera read. */
function scan(token: string, code: string) {
	const request = new Request('http://localhost:5173/lti-link/enroll?/scan', {
		method: 'POST',
		body: new URLSearchParams({ token, code })
	});
	return actions.scan({ request, getClientAddress: () => '10.0.0.7' } as never);
}

// Names nobody, so no organizer gets a scan alongside.
const HOST = 'no-such-organizer';

test('scanning inside the launched page files a scan, no phone set up', async () => {
	const { id } = attendee()!;
	db.delete(scanRow).where(eq(scanRow.userId, id)).run();
	const token = tokenFrom(await launch());
	const code = bucketToken(HOST);

	expect(await scan(token, code)).toEqual({ scanned: 'Ada' });
	// Submitted twice: still one scan.
	expect(await scan(token, code)).toEqual({ scanned: 'Ada' });
	const rows = db.select().from(scanRow).where(eq(scanRow.userId, id)).all();
	expect(rows).toMatchObject([{ method: 'lti', ipAddress: '10.0.0.7' }]);

	// Another code is another scan, and a row of its own: coming back in.
	await scan(token, bucketToken(HOST, Date.now() - BUCKET_MS));
	expect(await db.$count(scanRow, eq(scanRow.userId, id))).toBe(2);
});

test('two attendees scanning the same code get scans of their own', async () => {
	const code = bucketToken(HOST);
	const ada = tokenFrom(await launch());
	const other = tokenFrom(await launch({ sub: '666' }));
	await scan(ada, code);
	await scan(other, code);

	const scanOf = (token: string) =>
		db
			.select({ codeScanId: scanRow.codeScanId })
			.from(scanRow)
			.where(eq(scanRow.userId, verifyEnrollment(token)!.userId))
			.orderBy(desc(scanRow.scannedAt))
			.get()!.codeScanId;
	// Or one code_scan_id across many attendees would look like one device
	// scanning for borrowed accounts, which is what the log's scan column is for.
	expect(scanOf(ada)).not.toBe(scanOf(other));
});

test('a scan needs a fresh launch and a live code', async () => {
	const { id } = attendee()!;
	const before = await db.$count(scanRow, eq(scanRow.userId, id));

	const stale = issueEnrollment({ userId: id, firstName: 'Ada' }, Date.now() - ENROLLMENT_MS - 1);
	expect(await scan(stale, bucketToken(HOST))).toMatchObject({ status: 403 });
	expect(await scan('forged', bucketToken(HOST))).toMatchObject({ status: 403 });

	const token = tokenFrom(await launch());
	const old = bucketToken(HOST, Date.now() - 2 * BUCKET_MS);
	expect(await scan(token, old)).toMatchObject({ status: 403 });
	expect(await scan(token, 'made-up.code')).toMatchObject({ status: 403 });

	expect(await db.$count(scanRow, eq(scanRow.userId, id))).toBe(before);
});
