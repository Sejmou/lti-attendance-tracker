<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let token = $state('');
	let embedded = $state(false);
	let mounted = $state(false);
	let signInForm = $state<HTMLFormElement>();

	onMount(async () => {
		// The launch hands the token over in the fragment, which no server sees.
		// Out of the address bar straight away, so it isn't bookmarked or shared.
		token = location.hash.slice(1);
		if (token) history.replaceState(history.state, '', location.pathname + location.search);

		// Inside the platform's frame, a cookie set here would be a third-party
		// one: partitioned or blocked, and gone the moment the admin pages open
		// in a tab of their own. So the session is only started top-level.
		embedded = window.self !== window.top;
		mounted = true;
		if (token && !embedded) {
			await tick();
			signInForm?.requestSubmit();
		}
	});
</script>

<svelte:head><title>{m.admin_title()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
	{#if form?.message}
		<h1 class="text-2xl font-semibold">{m.enroll_problem_heading()}</h1>
		<p class="text-gray-600" role="alert">{form.message}</p>
	{:else if !mounted}
		<p class="text-gray-600">{m.loading()}</p>
	{:else if !token}
		<h1 class="text-2xl font-semibold">{m.admin_open_from_lms_heading()}</h1>
		<p class="text-gray-600">{m.admin_open_from_lms_text()}</p>
	{:else if embedded}
		<h1 class="text-2xl font-semibold">{m.admin_title()}</h1>
		<p class="text-gray-600">{m.admin_embedded_text()}</p>
		<button
			type="button"
			onclick={() => window.open(`${resolve('/lti-link/admin')}#${token}`, '_blank', 'noopener')}
			class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
		>
			{m.enroll_continue_new_tab()}
		</button>
	{:else}
		<p class="text-gray-600">{m.loading()}</p>
		<form method="post" action="?/signIn" hidden bind:this={signInForm} use:enhance>
			<input type="hidden" name="token" value={token} />
		</form>
	{/if}
</main>
