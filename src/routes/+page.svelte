<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.app_title()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">{m.app_title()}</h1>
	<p class="text-gray-600">
		{m.home_intro({ button: m.enroll_set_up() })}
	</p>
</main>
