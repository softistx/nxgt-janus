/**
 * An instrumented instance is typed as the instance it wraps: each
 * `@ts-expect-error` is a refusal of `@nxgt/janus` that must survive it.
 */

import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import {
	createMemoryRelations,
	defineModel,
	permissions,
} from '@nxgt/janus/permissions';
import { z } from 'zod';
import { instrumentJanus, instrumentPermissions } from '../../src/index';

const auth = instrumentJanus(
	janus({
		users: {
			patient: {
				schema: z.strictObject({ email: z.email() }),
				password: { login: 'email' },
			},
		},
		store: createMemoryStores(),
		hasher: scryptHasher(),
	}),
);

async function flows() {
	const { user } = await auth.patient.signIn({ email: '', password: '' });
	const email: string = user.email;
	// @ts-expect-error 1. a sign-in without its password
	await auth.patient.signIn({ email: '' });
	// @ts-expect-error 2. a user type the instance does not have
	await auth.staff.signIn({ username: '', password: '' });
	return email;
}

const access = instrumentPermissions(
	permissions({
		model: defineModel({
			subjects: auth.types,
			types: { record: { relations: { owner: ['patient'] } } },
		}),
		store: createMemoryRelations(),
	}),
);

async function questions() {
	const patient = { type: 'patient', id: 'u1' } as const;
	// @ts-expect-error 3. a permission record does not declare
	await access.can(patient, 'view', { type: 'record', id: 'r1' });
	return access.can(patient, 'owner', { type: 'record', id: 'r1' });
}

// @ts-expect-error 4. only a janus() instance can be instrumented as one
instrumentJanus('auth');
// @ts-expect-error 5. a permissions() instance is not a janus() one
instrumentJanus(access);
// @ts-expect-error 6. nor the other way round: it would trace nothing
instrumentPermissions(auth);

export const checked = { flows, questions };
