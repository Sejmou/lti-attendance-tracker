<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	/**
	 * What a phone shows once its scan is in: which way it counted, and for
	 * which event. A later scan is only provisionally the scan-out — another
	 * one after it takes its place — so the page says as much.
	 */
	let { scanned }: { scanned: { firstName: string; eventTitle: string; direction: 'in' | 'out' } } =
		$props();
</script>

<h1 class="text-2xl font-semibold">
	{scanned.direction === 'in' ? m.scan_in_heading() : m.scan_out_heading()}
</h1>
<p class="text-lg font-medium">{scanned.eventTitle}</p>
<p class="text-gray-600">
	{m.scan_done_text({ name: scanned.firstName })}
	{scanned.direction === 'in' ? m.scan_in_note() : m.scan_out_note()}
</p>
