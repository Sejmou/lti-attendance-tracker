import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * What a scan stores instead of the address it came from: enough to see that
 * two scans for one event came from the same address (see `annotate`), and
 * nothing more. Keyed per event, with a key derived from SIGNING_SECRET under
 * a prefix of its own, the way the tokens are: the same address hashes
 * differently for every event, so nobody can follow it across events, and
 * without the secret nobody can try addresses against it.
 *
 * Rotating SIGNING_SECRET mid-event means scans from before and after can't be
 * matched any more.
 */
export function ipHash(eventId: string, ip: string) {
	// Checked at startup by scan-token, which signs everything else with it.
	const secret = env.SIGNING_SECRET;
	if (!secret) throw new Error('SIGNING_SECRET is not set');

	const key = createHmac('sha256', secret).update(`ip-hash:${eventId}`).digest();
	return createHmac('sha256', key).update(ip).digest('base64url');
}
