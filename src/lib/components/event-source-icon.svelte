<script lang="ts">
	import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
	import CalendarSyncIcon from '@lucide/svelte/icons/calendar-sync';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';

	let { source }: { source: 'calendar' | 'manual' } = $props();

	const label = $derived(
		source === 'calendar' ? m.events_source_calendar() : m.events_source_manual()
	);
	const Icon = $derived(source === 'calendar' ? CalendarSyncIcon : CalendarPlusIcon);
</script>

<Tooltip.Root>
	<Tooltip.Trigger class="inline-flex shrink-0 text-muted-foreground" aria-label={label}>
		<Icon class="size-4" aria-hidden="true" />
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
