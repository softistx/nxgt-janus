import type { At } from '../at';
import type { ResolvedType } from '../config';
import type { Context } from '../context';
import { emailFlows } from '../email-flows';
import { magicLinkFlows } from '../magic-link';
import { provenSignInFlows } from '../proven-sign-in';
import { secondFactorFlows } from '../second-factor/flows';
import { signInCodeFlows } from '../sign-in-code';
import { stepUpFlows } from '../step-up/flows';
import type { AnyTypeApi } from './any-type-api';
import { findByEmailFlows } from './find-by-email';
import { findOrCreateFlows } from './find-or-create';
import { passwordFlows } from './password-flows';
import { recordFlows } from './record-flows';

/**
 * Everything one user type answers, gathered from its flows: its records,
 * its password, its sign-in on the application's proof, its second factor,
 * its sign-in code and link, its step-up, its e-mails, the lookup by e-mail and the lookup that creates.
 */
export function typeApi(context: Context, type: ResolvedType): AnyTypeApi {
	const at: At = (operation) =>
		context.config.single ? operation : `${type.name}.${operation}`;
	const secondFactor = secondFactorFlows(context, type, at);
	const signInCode = signInCodeFlows(context, type, at, secondFactor.finish);

	return {
		...recordFlows(context, type, at),
		...passwordFlows(context, type, at, secondFactor.finish),
		...provenSignInFlows(context, type, at, secondFactor.finish),

		secondFactor: secondFactor.api,
		signInCode,
		magicLink: magicLinkFlows(context, type, at, secondFactor.finish),
		stepUp: stepUpFlows(context, type, at),

		...findByEmailFlows(context, type),
		...findOrCreateFlows(context, type, at),
		...emailFlows(context, type, at),
	};
}
