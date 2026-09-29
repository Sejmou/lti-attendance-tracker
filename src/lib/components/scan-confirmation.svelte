<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime } from '$lib/time';

	type Scanned = { firstName: string; eventTitle: string } & (
		{ direction: 'in' | 'out' } | { alreadyInSince: Date }
	);

	/**
	 * What a phone shows once its scan is in: which way it counted, and for
	 * which event. A later scan is only provisionally the scan-out — another
	 * one after it takes its place — so the page says as much. A scan right
	 * after the scan-in was most likely someone unsure the first worked, and
	 * wrote nothing: that gets a "you're already in", not a scan-out.
	 */
	let { scanned }: { scanned: Scanned } = $props();

	// Unmistakable at a glance, so nobody scans again to make sure.
	const heading = $derived(
		'alreadyInSince' in scanned
			? m.scan_already_heading()
			: scanned.direction === 'in'
				? m.scan_in_heading()
				: m.scan_out_heading()
	);
</script>

<CircleCheckIcon class="size-16 text-green-600" aria-hidden="true" />
<h1 class="text-2xl font-semibold">{heading}</h1>
<p class="text-lg font-medium">{scanned.eventTitle}</p>
<p class="text-gray-600">
	{#if 'alreadyInSince' in scanned}
		{m.scan_already_text({
			time: formatDateTime(scanned.alreadyInSince, getLocale(), {
				hour: '2-digit',
				minute: '2-digit'
			})
		})}
		{m.scan_in_note()}
	{:else}
		{m.scan_done_text({ name: scanned.firstName })}
		{scanned.direction === 'in' ? m.scan_in_note() : m.scan_out_note()}
	{/if}
</p>
