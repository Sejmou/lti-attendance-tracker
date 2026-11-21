<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleQuestionMarkIcon from '@lucide/svelte/icons/circle-question-mark';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { attendanceShare } from '$lib/attendance-share';
	import { eventWhen, time } from '$lib/event-when';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	type Method = 'device' | 'lti' | 'host' | 'manual';
	type Event = {
		id: string;
		title: string;
		startsAt: Date;
		endsAt: Date;
		allDay: boolean;
		scans: { scannedAt: Date; method: Method; linked: boolean }[];
	};

	let { events }: { events: Event[] } = $props();

	let helpOpen = $state(false);

	// 93 %, 93%: the locale knows its own spacing.
	const percent = new Intl.NumberFormat(getLocale(), {
		style: 'percent',
		maximumFractionDigits: 0
	});

	const withoutScanOut = $derived(events.filter((e) => e.scans.length < 2).length);

	const METHODS = {
		device: m.attendance_method_device,
		lti: m.attendance_method_lti,
		host: m.attendance_method_host,
		manual: m.attendance_method_manual
	} as const;

	// Same rule as the organizers' attendance list: first in, last out if there are two or more.
	function role(index: number, count: number) {
		if (index === 0) return m.attendance_role_in();
		return index === count - 1 ? m.attendance_role_out() : m.attendance_role_none();
	}
</script>

<h1 class="text-2xl font-semibold">{m.attendance_heading()}</h1>

{#if events.length === 0}
	<p class="text-gray-600">{m.attendance_none()}</p>
{:else}
	<p class="flex items-center gap-1 text-gray-600">
		{m.attendance_events({ count: events.length })}
		{#if withoutScanOut}· {m.attendance_no_scan_out({ count: withoutScanOut })}{/if}
		<!-- Text-sized, unlike the admin pages' smaller help: a 12px icon looks lost next to 16px text. -->
		<Button
			variant="ghost"
			size="icon-sm"
			class="-my-2 text-gray-500"
			aria-label={m.attendance_help_title()}
			onclick={() => (helpOpen = true)}
		>
			<CircleQuestionMarkIcon class="size-4" />
		</Button>
	</p>

	<Dialog.Root bind:open={helpOpen}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>{m.attendance_help_title()}</Dialog.Title>
			</Dialog.Header>
			<div class="flex flex-col gap-3 text-sm">
				<p>{m.attendance_help_rule()}</p>
				<p>{m.attendance_help_missing()}</p>
				<p>{m.attendance_help_share()}</p>
				<p class="text-muted-foreground">{m.attendance_help_details()}</p>
			</div>
		</Dialog.Content>
	</Dialog.Root>

	<ul class="flex flex-col gap-2">
		{#each events as event (event.id)}
			{@const scanOut = event.scans.length >= 2 ? event.scans.at(-1) : null}
			{@const share = attendanceShare(event, event.scans[0].scannedAt, scanOut?.scannedAt ?? null)}
			<li>
				<details class="group rounded-lg border border-gray-200">
					<summary
						class="flex cursor-pointer list-none items-start justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden"
					>
						<span class="flex flex-col gap-1">
							<span class="font-medium">{event.title}</span>
							<span class="text-sm text-gray-500">{eventWhen(event)}</span>
							<span class="text-sm">
								{m.attendance_in({ time: time(event.scans[0].scannedAt) })}
								·
								{#if scanOut}
									{m.attendance_out({ time: time(scanOut.scannedAt) })}
									{#if share !== null}
										· <span class="text-gray-500">{percent.format(share)}</span>
									{/if}
								{:else}
									<span class="text-amber-700">{m.attendance_out_missing()}</span>
								{/if}
							</span>
						</span>
						<ChevronDownIcon
							class="mt-1 size-4 shrink-0 text-gray-400 transition group-open:rotate-180"
							aria-hidden="true"
						/>
					</summary>
					<ol class="flex flex-col gap-1 border-t border-gray-200 p-3 text-sm">
						{#each event.scans as scan, i (i)}
							<li class="flex justify-between gap-3">
								<span>
									<span class="tabular-nums">{time(scan.scannedAt)}</span>
									<span class="text-gray-600">
										{scan.linked ? m.attendance_method_manual_linked() : METHODS[scan.method]()}
									</span>
								</span>
								<span class="text-gray-500">{role(i, event.scans.length)}</span>
							</li>
						{/each}
					</ol>
				</details>
			</li>
		{/each}
	</ul>
{/if}
