<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { deleteDeviceKey, loadDeviceKey, sign, viewMessage } from '$lib/device-key';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import MoodleActivityLink from '$lib/components/moodle-activity-link.svelte';
	import MyAttendance from '$lib/components/my-attendance.svelte';
	import { m } from '$lib/messages';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// null until this browser has looked for its key.
	let hasDeviceKey = $state<boolean | null>(null);
	let keyId = $state('');
	let signature = $state('');
	let removing = $state(false);
	let removed = $state(false);

	async function remove() {
		await deleteDeviceKey();
		removing = false;
		removed = true;
		hasDeviceKey = false;
	}

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
	{#if form?.me && !removed}
		<p class="text-gray-600">{m.enroll_greeting_name({ name: form.me.firstName })}</p>
		<MyAttendance events={form.me.events} />
		<Button variant="outline" class="self-start" onclick={() => (removing = true)}>
			{m.home_remove()}
		</Button>
	{:else if hasDeviceKey === false || form?.notLinked}
		{#if removed}
			<p class="text-sm text-green-700" role="status">✓ {m.home_removed()}</p>
		{/if}
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

<AlertDialog.Root bind:open={removing}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.home_remove_title()}</AlertDialog.Title>
			<AlertDialog.Description>{m.home_remove_text()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.enroll_scan_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={remove}>
				{m.home_remove_confirm()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
