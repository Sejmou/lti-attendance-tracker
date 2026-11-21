<script lang="ts">
	import CalendarSyncIcon from '@lucide/svelte/icons/calendar-sync';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';

	/** Only synced events are marked: they are the ones managed elsewhere. */
	let { source }: { source: 'calendar' | 'manual' } = $props();
</script>

{#if source === 'calendar'}
	<Tooltip.Root>
		<Tooltip.Trigger
			class="inline-flex shrink-0 text-muted-foreground"
			aria-label={m.events_source_calendar()}
		>
			<CalendarSyncIcon class="size-4" aria-hidden="true" />
		</Tooltip.Trigger>
		<Tooltip.Content>{m.events_source_calendar()}</Tooltip.Content>
	</Tooltip.Root>
{/if}
