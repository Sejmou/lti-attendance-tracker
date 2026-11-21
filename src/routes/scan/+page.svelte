<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { loadDeviceKey, scanMessage, sign } from '$lib/device-key';
	import ScanConfirmation from '$lib/components/scan-confirmation.svelte';
	import MoodleActivityLink from '$lib/components/moodle-activity-link.svelte';
	import ManualEntryForm from '$lib/components/manual-entry-form.svelte';
	import { m } from '$lib/messages';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// null until this browser has looked for its key.
	let hasDeviceKey = $state<boolean | null>(null);
	let keyId = $state('');
	let signature = $state('');

	const scanned = $derived(form && 'scanned' in form ? form.scanned : null);

	// A set-up phone needs no further input: sign this scan and hand it straight
	// back. Posted rather than redeemed in load, so a GET never writes a scan.
	$effect(() => {
		const codeScanId = data.codeScanId;
		if (!codeScanId || form) return;
		void (async () => {
			const key = await loadDeviceKey().catch(() => undefined);
			hasDeviceKey = Boolean(key);
			if (!key) return;
			keyId = key.keyId;
			signature = await sign(key.privateKey, scanMessage(codeScanId));
			await tick();
			document.forms.namedItem('withDeviceKey')?.requestSubmit();
		})();
	});
</script>

<svelte:head><title>{m.page_scan()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
	{#if scanned}
		<ScanConfirmation {scanned} />
		{#if !('manualEntry' in scanned)}
			<a href={resolve('/')} class="text-blue-600 underline">{m.attendance_heading()}</a>
		{/if}
	{:else if !data.codeScanId}
		<h1 class="text-2xl font-semibold">{m.scan_prompt_heading()}</h1>
		<p class="text-gray-600">
			{m.scan_prompt_text()}
		</p>
	{:else if hasDeviceKey !== false && !form}
		<h1 class="text-2xl font-semibold">{m.scan_in_progress()}</h1>
		<form method="post" action="?/withDeviceKey" name="withDeviceKey" use:enhance>
			<input type="hidden" name="keyId" value={keyId} />
			<input type="hidden" name="signature" value={signature} />
		</form>
	{:else if hasDeviceKey}
		<!-- The key was there and was turned down; the message below says why. -->
		<h1 class="text-2xl font-semibold">{m.scan_failed_heading()}</h1>
	{:else}
		<h1 class="text-2xl font-semibold">{m.scan_set_up_heading()}</h1>
		<p class="text-gray-600">
			{m.scan_set_up_text()}
		</p>
	{/if}

	<!-- Once the phone's own way is known not to work: not linked, or turned down.
	     Moodle first: typing in details is the last resort. -->
	{#if data.codeScanId && !scanned && (hasDeviceKey === false || form)}
		<MoodleActivityLink />
		<ManualEntryForm {keyId} {signature} />
	{/if}

	<p class="text-sm text-red-600" role="alert">
		{form && 'message' in form ? form.message : ''}
	</p>
</main>
