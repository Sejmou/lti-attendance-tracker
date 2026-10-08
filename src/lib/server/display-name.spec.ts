import { expect, test } from 'vitest';
import { shortNames } from './display-name';

// "First Last", or "First names|Last" where either has spaces in it.
function shown(...fullNames: string[]) {
	const people = fullNames.map((name, i) => {
		const [firstName, lastName] = name.includes('|') ? name.split('|') : name.split(' ');
		return { id: String(i), firstName, lastName };
	});
	const names = shortNames(people);
	return people.map((p) => names.get(p.id));
}

test('someone alone with their first name is shown by it alone', () => {
	expect(shown('Anna Aichinger', 'Thomas Bauer')).toEqual(['Anna', 'Thomas']);
});

test('a shared first name takes the shortest start of the last name nobody else shares', () => {
	expect(shown('Anna Aichinger', 'Anna Bloberger')).toEqual(['Anna A.', 'Anna B.']);
	expect(shown('Thomas Schilling', 'Thomas Schirrer', 'Thomas Bauer')).toEqual([
		'Thomas Schil.',
		'Thomas Schir.',
		'Thomas B.'
	]);
});

test('a last name that starts another is shown whole, without a dot', () => {
	expect(shown('Thomas Schill', 'Thomas Schiller')).toEqual(['Thomas Schill', 'Thomas Schille.']);
});

test('two people with the same name are numbered, never shown in full', () => {
	expect(shown('Lukas Müller', 'Lukas Müller')).toEqual(['Lukas', 'Lukas (2)']);
	expect(shown('Lukas Müller', 'lukas müller', 'Lukas Müller')).toEqual([
		'Lukas',
		'lukas (2)',
		'Lukas (3)'
	]);
});

test('namesakes are told apart from everyone else as usual, and numbered among themselves', () => {
	expect(shown('Lukas Müller', 'Lukas Meier', 'Lukas Müller')).toEqual([
		'Lukas Mü.',
		'Lukas Me.',
		'Lukas Mü. (2)'
	]);
});

test('case does not tell names apart, but is kept as spelled', () => {
	expect(shown('anna Aichinger', 'Anna aigner')).toEqual(['anna Aic.', 'Anna aig.']);
});

test('a start that is the whole last name gets no dot', () => {
	expect(shown('Thomas Sch', 'Thomas Schu')).toEqual(['Thomas Sch', 'Thomas Schu']);
});

test('a second name is never shown, and never tells anyone apart', () => {
	expect(shown('Anna Maria|Bauer', 'Thomas Bauer')).toEqual(['Anna', 'Thomas']);
	expect(shown('Anna Maria|Bauer', 'Anna|Berger')).toEqual(['Anna Ba.', 'Anna Be.']);
	// The same as far as can be shown: numbered, not told apart by "Maria".
	expect(shown('Anna Maria|Bauer', 'Anna|Bauer')).toEqual(['Anna', 'Anna (2)']);
	expect(shown('  Anna   Maria |Bauer')).toEqual(['Anna']);
});
