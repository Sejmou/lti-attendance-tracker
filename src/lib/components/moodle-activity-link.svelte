<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { env } from '$env/dynamic/public';
	import { m } from '$lib/messages';

	// Optional: without it, the texts around this still say where to go.
	const url = env.PUBLIC_ATTENDEE_ACTIVITY_URL;
</script>

{#if url}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- external URL, not a route -->
	<a
		href={url}
		class="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
	>
		{m.open_attendee_activity()}
		<ExternalLinkIcon class="size-4" aria-hidden="true" />
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
