<script lang="ts">
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import QrCodeIcon from '@lucide/svelte/icons/qr-code';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/messages';

	const cards = [
		{
			route: '/admin/events',
			Icon: CalendarDaysIcon,
			title: m.events_title,
			text: m.admin_events_text
		},
		{ route: '/admin/code', Icon: QrCodeIcon, title: m.show_code, text: m.admin_code_text },
		{
			route: '/admin/attendees',
			Icon: UsersIcon,
			title: m.attendees_title,
			text: m.admin_attendees_text
		}
	] as const;
</script>

<svelte:head><title>{m.admin_title()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
	<h1 class="mb-2 text-2xl font-semibold">{m.admin_title()}</h1>

	{#each cards as { route, Icon, title, text } (route)}
		<a
			href={resolve(route)}
			class="flex items-start gap-3 border border-border p-4 transition-colors hover:bg-muted"
		>
			<Icon class="size-6 shrink-0 text-primary" aria-hidden="true" />
			<span class="flex flex-1 flex-col gap-1">
				<span class="text-lg font-semibold">{title()}</span>
				<span class="text-sm text-muted-foreground">{text()}</span>
			</span>
			<ChevronRightIcon
				class="size-5 shrink-0 self-center text-muted-foreground"
				aria-hidden="true"
			/>
		</a>
	{/each}

	<form method="post" action="?/signOut" use:enhance class="mt-2">
		<Button type="submit" variant="ghost" size="sm">
			<LogOutIcon />
			{m.admin_sign_out()}
		</Button>
	</form>
</main>
