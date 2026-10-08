<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { deviceName } from '$lib/device-name';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime } from '$lib/time';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Row = PageServerData['attendees'][number];

	// Longest gone first: those are the ones to think about deleting.
	let sortBy = $state<'name' | 'lastSeen'>('lastSeen');
	const attendees = $derived(
		sortBy === 'name'
			? data.attendees
			: data.attendees.toSorted((a, b) => a.lastSeenAt.getTime() - b.lastSeenAt.getTime())
	);

	let deleting = $state<Row | null>(null);

	const date = (at: Date) => formatDateTime(at, getLocale(), { dateStyle: 'medium' });
	const dateTime = (at: Date) =>
		formatDateTime(at, getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>{m.attendees_title()}</title></svelte:head>

{#snippet sortable(label: string, key: typeof sortBy)}
	<!-- Both ascending: A to Z, and the longest gone first. -->
	<Table.Head aria-sort={sortBy === key ? 'ascending' : 'none'}>
		<button
			type="button"
			class="inline-flex items-center gap-1 hover:underline"
			title={m.attendees_sort_hint()}
			onclick={() => (sortBy = key)}
		>
			{label}
			{#if sortBy === key}<ArrowDownIcon class="size-3.5" />{/if}
		</button>
	</Table.Head>
{/snippet}

<main class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
	<h1 class="text-2xl font-semibold">{m.attendees_title()}</h1>

	<p class="text-sm text-muted-foreground">
		{m.attendees_intro()}
		{#if form && 'deleted' in form}
			<span class="block" role="status">{m.attendees_deleted()}</span>
		{:else if form && 'missing' in form}
			<span class="block text-destructive" role="alert">{m.attendees_missing()}</span>
		{/if}
	</p>

	{#if attendees.length === 0}
		<p class="text-muted-foreground">{m.attendees_none()}</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					{@render sortable(m.attendees_col_name(), 'name')}
					<Table.Head>{m.attendees_col_first_seen()}</Table.Head>
					{@render sortable(m.attendees_col_last_seen(), 'lastSeen')}
					<Table.Head class="text-right">{m.events_col_scans()}</Table.Head>
					<Table.Head>{m.attendees_col_phone()}</Table.Head>
					<Table.Head><span class="sr-only">{m.events_col_actions()}</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each attendees as row (row.id)}
					<Table.Row>
						<Table.Cell class="whitespace-normal">
							<span class="font-medium">{row.firstName} {row.lastName}</span>
							<span class="block text-xs text-muted-foreground">{row.email}</span>
						</Table.Cell>
						<Table.Cell class="tabular-nums">{date(row.createdAt)}</Table.Cell>
						<Table.Cell class="tabular-nums">{date(row.lastSeenAt)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{row.scans}</Table.Cell>
						<Table.Cell class="whitespace-normal">
							{#if row.linked}
								<Badge variant="secondary">{m.attendees_phone_linked()}</Badge>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
							<!-- Every setup, replaced ones included: phone after phone stands out. -->
							{#if row.enrollments.length > 0}
								<details class="mt-1 text-xs text-muted-foreground">
									<summary class="cursor-pointer">
										{m.attendees_enrollments({ count: row.enrollments.length })}
									</summary>
									<ul class="mt-1 flex flex-col gap-0.5">
										{#each row.enrollments as setup, i (i)}
											<li class="tabular-nums" title={setup.userAgent ?? ''}>
												{dateTime(setup.enrolledAt)} · {deviceName(setup.userAgent)}
											</li>
										{/each}
									</ul>
								</details>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right">
							<Button variant="ghost" size="sm" onclick={() => (deleting = row)}>
								{m.attendees_delete()}
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}

	<a href={resolve('/admin')} class="text-blue-600 underline">{m.admin_title()}</a>
</main>

<AlertDialog.Root bind:open={() => deleting !== null, (open) => !open && (deleting = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.attendees_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.attendees_delete_text({
					name: `${deleting?.firstName ?? ''} ${deleting?.lastName ?? ''}`,
					email: deleting?.email ?? ''
				})}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.events_cancel()}</AlertDialog.Cancel>
			<form
				method="post"
				action="?/delete"
				use:enhance={() => {
					return async ({ update }) => {
						deleting = null;
						await update();
					};
				}}
			>
				<input type="hidden" name="id" value={deleting?.id} />
				<AlertDialog.Action type="submit" variant="destructive">
					{m.attendees_delete()}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
