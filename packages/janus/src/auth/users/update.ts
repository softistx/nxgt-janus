import type { ResolvedType } from '../config';
import { type Context, emailOf, writeUser } from '../context';
import { emit } from '../events';
import type { UserRecord } from '../port/types';
import type { UserRef, WriteOptions } from '../types';
import { emailChanged, fieldsPatch } from './fields-patch';
import type { Input } from './flow-types';

/**
 * `update`: the patch written over the stored fields, then — when it changed
 * the e-mail — `user.emailChanged`, carrying the address the write replaced,
 * which nothing keeps once it landed.
 */
export async function update(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	patch: Input,
	options: WriteOptions | undefined,
	where: string,
): Promise<UserRecord> {
	// The record the write replaced, read in its callback — which writeUser
	// always calls, once, before it writes under that record's version — so
	// the e-mail compared is the one this write changed.
	const seen: { replaced: UserRecord | null } = { replaced: null };
	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		(record) => {
			seen.replaced = record;
			return fieldsPatch(type, record, patch, where);
		},
	);
	const { replaced } = seen;
	if (
		replaced !== null &&
		emailChanged(type, replaced.fields, written.fields)
	) {
		await emit(context, 'user.emailChanged', written, written.updatedAt, {
			formerEmail: emailOf(type, replaced.fields),
		});
	}
	return written;
}
