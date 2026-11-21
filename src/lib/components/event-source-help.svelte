<script lang="ts">
	import CalendarSyncIcon from '@lucide/svelte/icons/calendar-sync';
	import CircleQuestionMarkIcon from '@lucide/svelte/icons/circle-question-mark';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { m } from '$lib/paraglide/messages';

	/** Null when no event comes from a calendar: then only making them here is explained. */
	let { calendar }: { calendar: { editUrl: string | null } | null } = $props();

	let open = $state(false);
</script>

<Button
	variant="ghost"
	size="icon-xs"
	aria-label={m.events_help_title()}
	onclick={() => (open = true)}
>
	<CircleQuestionMarkIcon />
</Button>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.events_help_title()}</Dialog.Title>
		</Dialog.Header>
		<div class="flex flex-col gap-4 text-sm">
			<p>{m.events_help_purpose()}</p>
			<section class="flex flex-col gap-3">
				<h3 class="font-medium">{m.events_help_sources_title()}</h3>
				{#if calendar}
					<p class="flex gap-3">
						<CalendarSyncIcon
							class="mt-0.5 size-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<span>
							<strong class="block">{m.events_source_calendar()}</strong>
							{m.events_help_calendar({ sync: m.events_sync() })}
						</span>
					</p>
				{/if}
				<!-- Unmarked in the list, so no icon here; indented to line up. -->
				<p class={[calendar && 'pl-7']}>
					<span>
						<strong class="block">{m.events_source_manual()}</strong>
						{m.events_help_manual({ newEvent: m.events_new() })}
					</span>
				</p>
			</section>
			<section class="flex flex-col gap-2">
				<h3 class="font-medium">{m.events_help_scans_title()}</h3>
				<p>{m.events_help_scans()}</p>
				<p>{m.events_help_scans_typed({ link: m.link_button() })}</p>
				<p class="text-muted-foreground">
					{m.events_help_scans_kept({ removed: m.events_removed() })}
				</p>
			</section>
		</div>
		{#if calendar?.editUrl}
			<Dialog.Footer>
				<Button href={calendar.editUrl} target="_blank" rel="noopener noreferrer" variant="outline">
					<ExternalLinkIcon data-icon="inline-start" />
					{m.events_help_open_calendar()}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
