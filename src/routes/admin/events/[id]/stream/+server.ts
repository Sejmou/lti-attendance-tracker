import { error } from '@sveltejs/kit';
import { onScan } from '$lib/server/scan-feed';
import type { RequestHandler } from './$types';

/**
 * Server-sent events, one per new scan for this event, for its code screen's live
 * audit. Guarded here rather than by the admin layout, which only runs for pages.
 */
export const GET: RequestHandler = ({ locals, params, request }) => {
	if (!locals.admin) error(403, 'Forbidden');

	const encoder = new TextEncoder();
	let stop = () => {};

	const stream = new ReadableStream({
		start(controller) {
			const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
			const unsubscribe = onScan((scan) => {
				if (scan.eventId === params.id) send(`data: ${JSON.stringify(scan)}\n\n`);
			});
			// Proxies close connections that stay silent; a comment line keeps it open.
			const heartbeat = setInterval(() => send(': ping\n\n'), 25_000);

			stop = () => {
				unsubscribe();
				clearInterval(heartbeat);
			};
			request.signal.addEventListener('abort', () => stop());
		},
		cancel: () => stop()
	});

	return new Response(stream, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }
	});
};
