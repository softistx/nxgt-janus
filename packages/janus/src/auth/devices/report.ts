import type { AnyUser, Context } from '../context';
import { emit } from '../events';
import type { SignInResult } from '../types';

/**
 * Sends `user.newDeviceSignedIn` for a session a new device just opened —
 * once the sign-in is complete, so a sign-in refused after its session
 * opened (a password written meanwhile) reports nothing. A challenge, and a
 * session from a known device or with no device given, report nothing
 * either.
 */
export async function reportNewDevice(
	context: Context,
	result: SignInResult<AnyUser>,
): Promise<void> {
	if (result.status !== 'signedIn' || !result.newDevice) return;
	await emit(
		context,
		'user.newDeviceSignedIn',
		result.user,
		result.session.createdAt,
		{ sessionId: result.session.id },
	);
}
