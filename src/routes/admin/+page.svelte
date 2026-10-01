<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.admin_title()}</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">{m.admin_title()}</h1>
	<a href={resolve('/admin/events')} class="text-blue-600 underline">{m.events_title()}</a>
	<a href={resolve('/admin/code')} class="text-blue-600 underline">{m.show_code()}</a>
	<a href={resolve('/admin/attendees')} class="text-blue-600 underline">{m.attendees_title()}</a>

	<form method="post" action="?/signOut" use:enhance>
		<button class="text-gray-500 underline">{m.admin_sign_out()}</button>
	</form>
</main>
