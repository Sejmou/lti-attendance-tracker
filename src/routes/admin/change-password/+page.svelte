<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const input =
		'rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none';
</script>

<svelte:head><title>{m.change_password_title()}</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
	{#if data.temporary}
		<h1 class="text-2xl font-semibold">{m.change_password_temporary_heading()}</h1>
		<p class="text-gray-600">{m.change_password_temporary_text()}</p>
	{:else}
		<h1 class="text-2xl font-semibold">{m.change_password_title()}</h1>
		<p class="text-gray-600">{m.change_password_text()}</p>
	{/if}

	<form method="post" use:enhance class="flex flex-col gap-4">
		{#if !data.temporary}
			<label class="flex flex-col gap-1">
				{m.change_password_current()}
				<input
					type="password"
					name="currentPassword"
					autocomplete="current-password"
					required
					class={input}
				/>
			</label>
		{/if}
		<label class="flex flex-col gap-1">
			{m.change_password_new()}
			<input
				type="password"
				name="password"
				autocomplete="new-password"
				minlength={data.minPasswordLength}
				required
				class={input}
			/>
		</label>
		<label class="flex flex-col gap-1">
			{m.change_password_confirm()}
			<input
				type="password"
				name="confirm"
				autocomplete="new-password"
				minlength={data.minPasswordLength}
				required
				class={input}
			/>
		</label>
		<button
			class="rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
		>
			{m.change_password_save()}
		</button>
	</form>

	{#if form && 'changed' in form}
		<p class="text-sm text-green-700" role="status">{m.change_password_changed()}</p>
	{:else}
		<p class="text-sm text-red-600" role="alert">{form?.message ?? ''}</p>
	{/if}

	{#if !data.temporary}
		<a href={resolve('/admin')} class="text-gray-500 underline">{m.back()}</a>
	{/if}
</main>
