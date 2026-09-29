<script lang="ts">
	import { parseTime, type Time } from '@internationalized/date';
	import { TimeField } from 'bits-ui';
	import { getLocale } from '$lib/paraglide/runtime';

	/**
	 * A time of day as HH:MM, posted under `name` in a hidden input. Always a
	 * 24-hour clock, unlike `<input type="time">`, which follows the browser's
	 * language and can't be told otherwise.
	 */
	let {
		id,
		name,
		label,
		value = $bindable(''),
		invalid = false
	}: { id: string; name: string; label: string; value?: string; invalid?: boolean } = $props();

	const parsed = (text: string) => {
		try {
			return text ? parseTime(text) : undefined;
		} catch {
			return undefined;
		}
	};
	const pad = (n: number) => String(n).padStart(2, '0');
</script>

<TimeField.Root
	bind:value={
		() => parsed(value),
		(time: Time | undefined) => (value = time ? `${pad(time.hour)}:${pad(time.minute)}` : '')
	}
	hourCycle={24}
	granularity="minute"
	locale={getLocale()}
>
	<TimeField.Label class="sr-only">{label}</TimeField.Label>
	<TimeField.Input
		{id}
		aria-invalid={invalid || undefined}
		class="flex h-10 w-full items-center border border-transparent border-b-input py-1 text-base tabular-nums transition-[border-color] focus-within:border-b-ring aria-invalid:border-b-destructive md:text-sm dark:aria-invalid:border-b-destructive/50"
	>
		{#snippet children({ segments })}
			{#each segments as { part, value: text }, i (i)}
				{#if part === 'literal'}
					<TimeField.Segment {part} class="text-muted-foreground">{text}</TimeField.Segment>
				{:else}
					<TimeField.Segment
						{part}
						class="px-0.5 outline-none focus:bg-muted data-placeholder:text-muted-foreground"
					>
						{text}
					</TimeField.Segment>
				{/if}
			{/each}
		{/snippet}
	</TimeField.Input>
</TimeField.Root>
<input type="hidden" {name} {value} />
