<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import { m } from '$lib/paraglide/messages';

	/**
	 * A calendar sync the page started without waiting on it. Says it is
	 * running, and once it has synced, reloads the page's data so the new
	 * events show up in place. Not on a failure: the reload would start
	 * another sync, which would fail again, and so on.
	 */
	let { sync }: { sync: Promise<'synced' | 'failed'> | null } = $props();

	$effect(() => {
		if (!sync) return;
		let current = true;
		void sync.then((outcome) => {
			if (current && outcome === 'synced') void invalidateAll();
		});
		return () => (current = false);
	});
</script>

{#if sync}
	{#await sync}
		<p class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
			<LoaderIcon class="size-4 animate-spin" aria-hidden="true" />
			{m.events_syncing()}
		</p>
	{:then outcome}
		{#if outcome === 'failed'}
			<p class="text-sm text-destructive" role="alert">{m.events_sync_failed()}</p>
		{/if}
	{/await}
{/if}
