<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	const names: Record<(typeof locales)[number], string> = { de: 'Deutsch', en: 'English' };

	// The AGPL (section 13) has whoever runs a modified version offer its users that version's source.
	const sourceUrl = env.PUBLIC_SOURCE_URL || 'https://github.com/Sejmou/lti-attendance-tracker';
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<!-- A column the height of the screen: pages grow to fill it, and the footer
     follows them instead of floating over whatever is at the bottom. -->
<div class="flex min-h-svh flex-col">
	{@render children()}

	<footer class="flex justify-end gap-3 px-4 pb-4 text-sm text-gray-500">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL, not a route -->
		<a href={sourceUrl} class="underline">{m.source_code()}</a>
		<nav aria-label={m.language()} class="flex gap-3">
			{#each locales as locale (locale)}
				<button
					type="button"
					lang={locale}
					aria-current={locale === getLocale() ? 'true' : undefined}
					onclick={() => setLocale(locale)}
					class="underline aria-[current]:font-semibold aria-[current]:no-underline"
				>
					{names[locale]}
				</button>
			{/each}
		</nav>
	</footer>
</div>
