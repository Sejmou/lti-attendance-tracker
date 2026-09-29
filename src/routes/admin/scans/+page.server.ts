import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scan, user } from '$lib/server/db/schema';
import { annotate } from '$lib/server/scan-log';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// ponytail: the whole log in one query on one page. An event is hundreds of
	// rows; add paging when a venue makes that untrue.
	const rows = await db
		.select({
			at: scan.scannedAt,
			method: scan.method,
			ipAddress: scan.ipAddress,
			userAgent: scan.userAgent,
			codeScanId: scan.codeScanId,
			userId: scan.userId,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email
		})
		.from(scan)
		.innerJoin(user, eq(user.id, scan.userId))
		.orderBy(desc(scan.scannedAt));

	return annotate(rows);
};
