<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { parseDate, type DateValue } from '@internationalized/date';
	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime, fromWallClock } from '$lib/time';

	/**
	 * A date as YYYY-MM-DD, posted under `name` in a hidden input: the picked
	 * day, with no time and no zone of its own.
	 */
	let {
		id,
		name,
		value = $bindable(''),
		placeholder,
		invalid = false
	}: {
		id: string;
		name: string;
		value?: string;
		placeholder: string;
		invalid?: boolean;
	} = $props();

	let open = $state(false);

	const parsed = (text: string) => {
		try {
			return text ? parseDate(text) : undefined;
		} catch {
			return undefined;
		}
	};

	// Noon rather than midnight, so the day shown can't slip across a DST change.
	const label = $derived(
		value && fromWallClock(value, '12:00')
			? formatDateTime(fromWallClock(value, '12:00')!, getLocale(), { dateStyle: 'medium' })
			: placeholder
	);
</script>

<Popover.Root bind:open>
	<Popover.Trigger {id}>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				aria-invalid={invalid || undefined}
				class={[
					'w-full justify-start font-normal tracking-normal normal-case',
					!value && 'text-muted-foreground'
				]}
			>
				<CalendarIcon />
				{label}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start">
		<Calendar
			type="single"
			bind:value={
				() => parsed(value),
				(picked: DateValue | undefined) => {
					value = picked?.toString() ?? '';
					open = false;
				}
			}
			locale={getLocale()}
			weekStartsOn={1}
			captionLayout="dropdown"
		/>
	</Popover.Content>
</Popover.Root>
<input type="hidden" {name} {value} />
