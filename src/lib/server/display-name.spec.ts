import { expect, test } from 'vitest';
import { shortNames } from './display-name';

function shown(...fullNames: string[]) {
	const people = fullNames.map((name, i) => {
		const [firstName, lastName] = name.split(' ');
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

test('two people with the same name are both shown in full', () => {
	expect(shown('Lukas Müller', 'Lukas Müller')).toEqual(['Lukas Müller', 'Lukas Müller']);
});

test('case does not tell names apart, but is kept as spelled', () => {
	expect(shown('anna Aichinger', 'Anna aigner')).toEqual(['anna Aic.', 'Anna aig.']);
});

test('a start that is the whole last name gets no dot', () => {
	expect(shown('Thomas Sch', 'Thomas Schu')).toEqual(['Thomas Sch', 'Thomas Schu']);
});
