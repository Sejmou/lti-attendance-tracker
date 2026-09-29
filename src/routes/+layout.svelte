<script lang="ts">
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	const names: Record<(typeof locales)[number], string> = { de: 'Deutsch', en: 'English' };
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}

<nav aria-label={m.language()} class="fixed right-4 bottom-4 flex gap-3 text-sm text-gray-500">
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
