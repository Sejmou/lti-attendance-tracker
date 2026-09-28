<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const input =
		'rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none';
	const button = 'rounded-md border border-gray-300 px-4 py-2 transition hover:bg-gray-50';

	// Only admins the superadmin can reset: not themselves.
	const resettable = $derived(data.admins?.filter((a) => a.role === 'admin') ?? []);
	const failedEmail = (action: string) =>
		form?.action === action && 'email' in form ? form.email : '';
</script>

{#snippet outcome(action: string)}
	{#if form?.action === action && 'done' in form}
		<p class="text-sm text-green-700" role="status">{form.done}</p>
	{:else if form?.action === action && 'message' in form}
		<p class="text-sm text-red-600" role="alert">{form.message}</p>
	{/if}
{/snippet}

<svelte:head><title>{m.admin_title()}</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">{m.admin_title()}</h1>
	<a href={resolve('/admin/generate-checkin-qr')} class="text-blue-600 underline">
		{m.show_checkin_code()}
	</a>
	<a href={resolve('/admin/checkins')} class="text-blue-600 underline">{m.checkin_log()}</a>

	{#if data.admins}
		<section class="flex flex-col gap-4 border-t border-gray-200 pt-6">
			<h2 class="text-lg font-semibold">{m.admin_organizers()}</h2>
			<ul class="flex flex-col gap-1 text-sm">
				{#each data.admins as admin (admin.email)}
					<li>
						{admin.firstName}
						{admin.lastName}
						<span class="text-gray-500">{admin.email}</span>
						{#if admin.role === 'superadmin'}
							<span class="text-gray-500">· {m.admin_superadmin()}</span>
						{:else if admin.mustChangePassword}
							<span class="text-gray-500">· {m.admin_has_temporary_password()}</span>
						{/if}
					</li>
				{/each}
			</ul>

			<form method="post" action="?/promote" use:enhance class="flex flex-col gap-4">
				<h3 class="font-medium">{m.admin_promote_heading()}</h3>
				<label class="flex flex-col gap-1">
					{m.admin_guest_email()}
					<input
						type="email"
						name="email"
						autocomplete="off"
						required
						value={failedEmail('promote')}
						class={input}
					/>
				</label>
				<label class="flex flex-col gap-1">
					{m.admin_initial_password()}
					<input type="text" name="password" autocomplete="off" required class={input} />
					<span class="text-sm text-gray-500">
						{m.admin_initial_password_hint()}
					</span>
				</label>
				<button class={button}>{m.admin_promote_button()}</button>
				{@render outcome('promote')}
			</form>

			{#if resettable.length}
				<form method="post" action="?/resetPassword" use:enhance class="flex flex-col gap-4">
					<h3 class="font-medium">{m.admin_reset_heading()}</h3>
					<label class="flex flex-col gap-1">
						{m.admin_organizer()}
						<select name="email" required class={input}>
							{#each resettable as admin (admin.email)}
								<option value={admin.email}>
									{admin.firstName}
									{admin.lastName} ({admin.email})
								</option>
							{/each}
						</select>
					</label>
					<label class="flex flex-col gap-1">
						{m.admin_temporary_password()}
						<input type="text" name="password" autocomplete="off" required class={input} />
						<span class="text-sm text-gray-500">
							{m.admin_reset_hint()}
						</span>
					</label>
					<button class={button}>{m.admin_reset_button()}</button>
					{@render outcome('reset')}
				</form>
			{/if}
		</section>
	{/if}

	<a href={resolve('/admin/change-password')} class="text-blue-600 underline">
		{m.admin_change_password()}
	</a>
	<form method="post" action="?/signOut" use:enhance>
		<button class="text-gray-500 underline">{m.admin_sign_out()}</button>
	</form>
</main>
