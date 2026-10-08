import { and, eq, inArray, notLike, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scan, user } from '$lib/server/db/schema';

export type Details = { email: string; firstName: string; lastName: string };

/** The `ltiSubject` of someone who typed in their details: see user. */
const manualSubject = (email: string) => JSON.stringify(['manual', email]);
/** Matches every `manualSubject`, for LIKE. */
export const MANUAL_SUBJECTS = '["manual",%';

// Loose on purpose: it only has to catch a slip of the thumb. Nothing
// checks the address is real, let alone theirs.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 200;

/** What was typed in, tidied, or null if a field is missing or isn't plausible. */
export function parseDetails(form: FormData): Details | null {
	const field = (name: string) => {
		const value = form.get(name);
		return typeof value === 'string' ? value.trim() : '';
	};
	const details = {
		email: field('email').toLowerCase(),
		firstName: field('firstName'),
		lastName: field('lastName')
	};
	const valid =
		EMAIL.test(details.email) &&
		Object.values(details).every((value) => value && value.length <= MAX_LENGTH);
	return valid ? details : null;
}

/**
 * The person typed in under this address, made on first use. Never a platform
 * account, even one with the same address: anyone can type anyone's, and a
 * scan filed under the account would count as theirs. An organizer links the
 * two by hand (see `link`).
 *
 * The name they typed the first time stays; a later one is ignored, so
 * someone else typing the same address can't rename them.
 */
export function manualEntryUser(details: Details) {
	return db.transaction((tx) => {
		const ltiSubject = manualSubject(details.email);
		const found = tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.ltiSubject, ltiSubject))
			.get();
		if (found) return found.id;
		return tx
			.insert(user)
			.values({ id: crypto.randomUUID(), ...details, ltiSubject })
			.returning({ id: user.id })
			.get().id;
	});
}

/**
 * Platform accounts whose address matches each of these typed-in people's,
 * as suggestions to link them to. An address can be on more than one account
 * (two platforms), so there may be several.
 */
export function linkSuggestions(reportedAs: string[]) {
	if (reportedAs.length === 0) return new Map<string, Suggestion[]>();
	const typed = db
		.select({ id: user.id, email: user.email })
		.from(user)
		.where(inArray(user.id, reportedAs))
		.all();
	const accounts = db
		.select({
			id: user.id,
			email: sql<string>`lower(${user.email})`,
			firstName: user.firstName,
			lastName: user.lastName
		})
		.from(user)
		.where(
			and(
				notLike(user.ltiSubject, MANUAL_SUBJECTS),
				inArray(
					sql`lower(${user.email})`,
					typed.map((row) => row.email)
				)
			)
		)
		.all();
	return new Map(
		typed.map(({ id, email }) => [
			id,
			accounts
				.filter((account) => account.email === email)
				.map(({ id, firstName, lastName }) => ({ id, firstName, lastName }))
		])
	);
}

export type Suggestion = { id: string; firstName: string; lastName: string };

/**
 * Files what someone typed in for this event under a platform account, once
 * an organizer is satisfied it was them. Only for this event: the next one
 * is another call to make. The scans stay `manual`, and `reportedAs` keeps
 * who was typed in, so `unlink` puts them back.
 *
 * False if it couldn't: the account isn't a platform account, or it already
 * has a row for one of the same code scans.
 */
export function link(eventId: string, reportedAs: string, userId: string) {
	const account = db
		.select({ id: user.id })
		.from(user)
		.where(and(eq(user.id, userId), notLike(user.ltiSubject, MANUAL_SUBJECTS)))
		.get();
	if (!account) return false;
	try {
		db.update(scan)
			.set({ userId })
			.where(and(eq(scan.eventId, eventId), eq(scan.reportedAs, reportedAs)))
			.run();
		return true;
	} catch (error) {
		// scan_user_code_scan_unq: the account already has one of these code scans.
		if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
			return false;
		}
		throw error;
	}
}

/** Undoes `link`: the scans go back to who was typed in. */
export function unlink(eventId: string, reportedAs: string) {
	db.update(scan)
		.set({ userId: reportedAs })
		.where(and(eq(scan.eventId, eventId), eq(scan.reportedAs, reportedAs)))
		.run();
}
