import { describe, expect, it } from 'bun:test';
import { permissions } from './engine';
import { defineModel, fromField, resolvedOf, when } from './model';
import { createMemoryRelations } from './port/memory';

const subjects = ['patient', 'staff'] as const;

/** The same clinic, in both spellings. */
const strings = defineModel({
	subjects,
	types: {
		team: {
			relations: { members: ['staff', 'team#members'], leads: ['staff'] },
			permissions: { manage: ['leads'], view: ['members', 'manage'] },
		},
		record: {
			relations: {
				doctors: fromField('doctorId', 'staff'),
				teams: ['team'],
			},
			permissions: {
				view: ['doctors', 'teams->view'],
				edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
			},
		},
	},
});

const references = defineModel({
	subjects,
	types: {
		team: {
			related: { members: ['staff', 'team#members'], leads: ['staff'] },
			permits: ['manage', 'view'],
		},
		record: {
			related: { doctors: fromField('doctorId', 'staff'), teams: ['team'] },
			permits: ['view', 'edit'],
		},
	},
	rules: {
		team: {
			manage: ({ related }) => [related.leads],
			view: ({ related, permits }) => [related.members, permits.manage],
		},
		record: {
			view: ({ related }) => [related.doctors, related.teams.permits.view],
			edit: ({ related }) => [
				when(related.doctors, (ctx: { onShift: boolean }) => ctx.onShift),
			],
		},
	},
});

describe('defineModel, the reference form', () => {
	it('resolves to the same model as the string form, condition included', () => {
		const a = resolvedOf(strings);
		const b = resolvedOf(references);
		expect([...b.types.keys()]).toEqual([...a.types.keys()]);
		for (const [name, type] of a.types) {
			const other = b.types.get(name);
			expect(other?.relations).toEqual(type.relations);
			expect([...(other?.permissions.keys() ?? [])]).toEqual([
				...type.permissions.keys(),
			]);
			for (const [permission, rules] of type.permissions) {
				const theirs = other?.permissions.get(permission) ?? [];
				expect(theirs.map(({ test: _, ...rule }) => rule)).toEqual(
					rules.map(({ test: _, ...rule }) => rule),
				);
				expect(theirs.map((rule) => typeof rule.test)).toEqual(
					rules.map((rule) => typeof rule.test),
				);
			}
		}
		expect(references.definition.rules).toBeDefined();
	});

	it('answers the same checks, and keeps its condition', async () => {
		const access = permissions({
			model: references,
			store: createMemoryRelations(),
		});
		const ada = { type: 'staff', id: 'ada' } as const;
		const bob = { type: 'staff', id: 'bob' } as const;
		const team = { type: 'team', id: 't1' } as const;
		const record = { type: 'record', id: 'r1', doctorId: 'bob' } as const;
		await access.grant(team, 'leads', ada);
		expect(await access.can(ada, 'view', team)).toBe(true);
		expect(await access.can(bob, 'view', team)).toBe(false);
		await access.grant(record, 'teams', team);
		expect(await access.can(ada, 'view', record)).toBe(true);
		expect(await access.can(bob, 'view', record)).toBe(true);
		expect(
			await access.can(bob, 'edit', record, { ctx: { onShift: true } }),
		).toBe(true);
		expect(
			await access.can(bob, 'edit', record, { ctx: { onShift: false } }),
		).toBe(false);
	});

	it('calls each rule once, when the model is defined, and never during a check', async () => {
		let calls = 0;
		const model = defineModel({
			subjects,
			types: { folder: { related: { owners: ['staff'] }, permits: ['view'] } },
			rules: {
				folder: {
					view: ({ related }) => {
						calls += 1;
						return [related.owners];
					},
				},
			},
		});
		expect(calls).toBe(1);
		const access = permissions({ model, store: createMemoryRelations() });
		await access.can({ type: 'staff', id: 'ada' }, 'view', {
			type: 'folder',
			id: 'f1',
		});
		expect(calls).toBe(1);
	});

	it('hands a rule frozen references, with the arrows every holder type admits', () => {
		let given: unknown;
		defineModel({
			subjects,
			types: {
				folder: { related: { owners: ['staff'] }, permits: ['view', 'share'] },
				box: { related: { owners: ['staff'] }, permits: ['view'] },
				document: {
					related: { parents: ['folder', 'box'], authors: ['staff'] },
					permits: ['view'],
				},
			},
			rules: {
				folder: {
					view: ({ related }) => [related.owners],
					share: ({ permits }) => [permits.view],
				},
				box: { view: ({ related }) => [related.owners] },
				document: {
					view: (param) => {
						given = param;
						return [param.related.parents.permits.view];
					},
				},
			},
		});
		expect(given).toEqual({
			related: {
				parents: {
					kind: 'relation',
					type: 'document',
					name: 'parents',
					// `share` is the folder's alone: not common to both holders.
					permits: {
						view: { kind: 'arrow', relation: 'parents', permission: 'view' },
					},
					related: {
						owners: {
							kind: 'arrow',
							relation: 'parents',
							permission: 'owners',
						},
					},
				},
				// A user type has no permits: nothing to arrow into.
				authors: { kind: 'relation', type: 'document', name: 'authors' },
			},
			permits: {},
		});
		expect(Object.isFrozen((given as { related: object }).related)).toBe(true);
	});
});

describe('refuses, with a TypeError, what only running it can see', () => {
	const define = (config: unknown) => () =>
		defineModel(config as Parameters<typeof defineModel>[0]);
	const folder = { related: { owners: ['staff'] }, permits: ['view'] };
	const view = ({ related }: { related: { owners: unknown } }) => [
		related.owners,
	];
	const cases: [string, () => unknown, string][] = [
		[
			'both spellings of the relations on one type',
			define({
				subjects,
				types: { folder: { ...folder, relations: {} } },
				rules: { folder: { view } },
			}),
			'types.folder has both relations and related',
		],
		[
			'both spellings of the permissions on one type',
			define({
				subjects,
				types: { folder: { ...folder, permissions: {} } },
				rules: { folder: { view } },
			}),
			'types.folder has both permissions and permits',
		],
		[
			'permits that are not names',
			define({
				subjects,
				types: { folder: { ...folder, permits: [1] } },
				rules: { folder: { view } },
			}),
			'types.folder.permits must be an array of permission names',
		],
		[
			'a permit declared twice',
			define({
				subjects,
				types: { folder: { ...folder, permits: ['view', 'view'] } },
				rules: { folder: { view } },
			}),
			'types.folder.permits names "view" twice',
		],
		[
			'a permit without a rule',
			define({ subjects, types: { folder } }),
			'rules.folder.view is missing — a function ({ related, permits }) => [related.…, permits.…]',
		],
		[
			'a rule for a permit the type does not declare',
			define({
				subjects,
				types: { folder },
				rules: { folder: { view, edit: view } },
			}),
			'rules.folder.edit: "edit" is not in types.folder.permits',
		],
		[
			'rules for a type that does not exist',
			define({
				subjects,
				types: { folder },
				rules: { folder: { view }, box: { view } },
			}),
			'rules.box: no object type named "box"',
		],
		[
			'rules for a type written with strings',
			define({
				subjects,
				types: {
					folder: {
						relations: { owners: ['staff'] },
						permissions: { view: ['owners'] },
					},
				},
				rules: { folder: { view } },
			}),
			'rules.folder: types.folder writes its permissions as strings',
		],
		[
			'a rule that is not a function',
			define({
				subjects,
				types: { folder },
				rules: { folder: { view: ['owners'] } },
			}),
			'rules.folder.view is missing',
		],
		[
			'a rule answering nothing',
			define({
				subjects,
				types: { folder },
				rules: { folder: { view: () => [] } },
			}),
			'rules.folder.view must answer a non-empty array of references',
		],
		[
			'a rule answering a boolean',
			define({
				subjects,
				types: { folder },
				rules: { folder: { view: () => true } },
			}),
			'rules.folder.view must answer a non-empty array of references',
		],
		[
			'a reference to a relation the type does not have',
			define({
				subjects,
				types: { folder },
				rules: {
					folder: {
						view: ({ related }: { related: Record<string, unknown> }) => [
							related.viewers,
						],
					},
				},
			}),
			'rules.folder.view[0] is undefined — related.x, permits.p, related.x.permits.p, or when(one of those, test)',
		],
		[
			'a string among the references',
			define({
				subjects,
				types: { folder },
				rules: { folder: { view: () => ['owners'] } },
			}),
			'rules.folder.view[0] is not a reference',
		],
		[
			'a key an object type does not have, in the reference form',
			define({
				subjects,
				types: { folder: { ...folder, roles: {} } },
				rules: { folder: { view } },
			}),
			'types.folder.roles is not a key of an object type: related or permits',
		],
		[
			'a permit that is not camelCase — the string form’s check, after the spelling out',
			define({
				subjects,
				types: { folder: { ...folder, permits: ['can-view'] } },
				rules: { folder: { 'can-view': view } },
			}),
			'"can-view" must be a camelCase name',
		],
	];
	for (const [name, run, message] of cases) {
		it(name, () => {
			expect(run).toThrow(TypeError);
			expect(run).toThrow(message);
		});
	}

	it('lets the error of a rule that throws through, as it is', () => {
		const boom = new Error('boom');
		const run = () =>
			defineModel({
				subjects,
				types: { folder },
				rules: {
					folder: {
						view: () => {
							throw boom;
						},
					},
				},
			} as never);
		expect(run).toThrow(boom);
	});
});
