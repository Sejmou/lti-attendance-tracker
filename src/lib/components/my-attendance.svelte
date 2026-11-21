<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { eventWhen, time } from '$lib/event-when';
	import { m } from '$lib/paraglide/messages';

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
	<p class="text-gray-600">
		{m.attendance_events({ count: events.length })}
		{#if withoutScanOut}· {m.attendance_no_scan_out({ count: withoutScanOut })}{/if}
	</p>

	<ul class="flex flex-col gap-2">
		{#each events as event (event.id)}
			{@const scanOut = event.scans.length >= 2 ? event.scans.at(-1) : null}
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
	<p class="text-sm text-gray-500">{m.attendance_note()}</p>
{/if}
