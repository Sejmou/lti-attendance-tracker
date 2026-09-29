<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime } from '$lib/time';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const when = (at: Date) =>
		formatDateTime(at, getLocale(), {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	const methods = {
		device: m.scans_method_device,
		lti: m.scans_method_lti,
		host: m.scans_method_host
	};

	const hints: Partial<Record<keyof typeof methods, () => string>> = {
		host: m.scans_host_hint,
		lti: m.scans_lti_hint
	};

	// The full string is in the title attribute; the table is for scanning.
	const device = (userAgent: string | null) =>
		userAgent
			?.match(/\((.*?)\)/)?.[1]
			?.split(';')[0]
			?.trim() ??
		userAgent?.slice(0, 24) ??
		'—';
</script>

<svelte:head><title>{m.scan_log()}</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 p-6">
	<div class="flex flex-wrap items-baseline justify-between gap-3">
		<h1 class="text-2xl font-semibold">{m.scan_log()}</h1>
		<a href={resolve('/admin/code')} class="text-blue-600 underline">{m.show_code()}</a>
	</div>

	<p class="text-gray-600">
		{m.scans_summary({
			scans: data.rows.length,
			attendees: data.attendees,
			addresses: data.addresses
		})}
	</p>

	{#if data.rows.length === 0}
		<p class="text-gray-500">{m.scans_none()}</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-left text-sm">
				<thead class="border-b border-gray-300 text-gray-600">
					<tr>
						<th class="py-2 pr-4 font-medium">{m.scans_col_when()}</th>
						<th class="py-2 pr-4 font-medium">{m.scans_col_attendee()}</th>
						<th class="py-2 pr-4 font-medium">{m.scans_col_method()}</th>
						<th class="py-2 pr-4 font-medium">{m.scans_col_address()}</th>
						<th class="py-2 pr-4 font-medium">{m.scans_col_device()}</th>
						<th class="py-2 font-medium">{m.scans_col_scan()}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as row (row.codeScanId + row.userId)}
						<tr class="border-b border-gray-100">
							<td class="py-2 pr-4 whitespace-nowrap">{when(row.at)}</td>
							<td class="py-2 pr-4">
								{row.firstName}
								{row.lastName}
								<span class="block text-xs text-gray-500">{row.email}</span>
							</td>
							<td class="py-2 pr-4" title={hints[row.method]?.()}>
								{methods[row.method]()}
							</td>
							<td class="py-2 pr-4 whitespace-nowrap">
								{row.ipAddress ?? '—'}
								{#if row.sharedAddress}
									<span
										class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
										title={m.scans_shared_hint()}
									>
										{m.scans_shared()}
									</span>
								{/if}
							</td>
							<td class="py-2 pr-4" title={row.userAgent ?? ''}>{device(row.userAgent)}</td>
							<td class="py-2 font-mono text-xs text-gray-500">
								{row.codeScanId}
								{#if row.repeat}
									<span
										class="ml-1 rounded bg-gray-100 px-1.5 py-0.5 font-sans text-xs text-gray-600"
										title={m.scans_again_hint()}
									>
										{m.scans_again()}
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="text-sm text-gray-500">
			{m.scans_footnote()}
		</p>
	{/if}
</main>
