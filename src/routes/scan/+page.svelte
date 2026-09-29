<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { loadDeviceKey, scanMessage, sign } from '$lib/device-key';
	import ScanConfirmation from '$lib/components/scan-confirmation.svelte';
	import { m } from '$lib/paraglide/messages';
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

<main class="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
	{#if scanned}
		<ScanConfirmation {scanned} />
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
			{m.scan_set_up_text({ button: m.enroll_set_up() })}
		</p>
	{/if}

	<p class="text-sm text-red-600" role="alert">
		{form && 'message' in form ? form.message : ''}
	</p>
</main>
