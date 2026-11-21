<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { loadDeviceKey, sign, viewMessage } from '$lib/device-key';
	import MoodleActivityLink from '$lib/components/moodle-activity-link.svelte';
	import MyAttendance from '$lib/components/my-attendance.svelte';
	import { m } from '$lib/messages';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// null until this browser has looked for its key.
	let hasDeviceKey = $state<boolean | null>(null);
	let keyId = $state('');
	let signature = $state('');

	// A linked phone needs no input: sign the challenge and ask for its owner's attendance.
	onMount(async () => {
		const key = await loadDeviceKey().catch(() => undefined);
		hasDeviceKey = Boolean(key);
		if (!key) return;
		keyId = key.keyId;
		signature = await sign(key.privateKey, viewMessage(data.challenge));
		await tick();
		document.forms.namedItem('attendance')?.requestSubmit();
	});
</script>

<svelte:head><title>{m.app_title()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
	{#if form?.me}
		<p class="text-gray-600">{m.enroll_greeting_name({ name: form.me.firstName })}</p>
		<MyAttendance events={form.me.events} />
	{:else if hasDeviceKey === false || form?.notLinked}
		<h1 class="text-2xl font-semibold">{m.home_not_linked_heading()}</h1>
		<p class="text-gray-600">{m.home_not_linked_text()}</p>
		<MoodleActivityLink />
	{:else if form?.message}
		<p class="text-sm text-red-600" role="alert">{form.message}</p>
	{:else}
		<p class="text-gray-600">{m.loading()}</p>
		<form method="post" action="?/attendance" name="attendance" use:enhance>
			<input type="hidden" name="keyId" value={keyId} />
			<input type="hidden" name="signature" value={signature} />
			<input type="hidden" name="challenge" value={data.challenge} />
		</form>
	{/if}
</main>
