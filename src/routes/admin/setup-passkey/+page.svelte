<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import { m } from '$lib/paraglide/messages';

	let error = $state('');
	let registering = $state(false);

	async function addPasskey() {
		registering = true;
		error = '';
		const result = await authClient.passkey.addPasskey();
		registering = false;

		if (result?.error) {
			error = m.passkey_failed();
			return;
		}
		await goto(resolve('/admin'), { invalidateAll: true });
	}
</script>

<svelte:head><title>{m.passkey_title()}</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">{m.passkey_title()}</h1>
	<p class="text-gray-600">
		{m.passkey_text()}
	</p>

	<button
		type="button"
		onclick={addPasskey}
		disabled={registering}
		class="rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
	>
		{registering ? m.waiting_for_device() : m.passkey_title()}
	</button>

	<form method="post" action="?/skip">
		<button class="text-sm text-gray-500 underline">{m.passkey_skip()}</button>
	</form>

	<p class="text-sm text-red-600" role="alert">{error}</p>
</main>
