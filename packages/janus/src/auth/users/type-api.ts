import type { At } from '../at';
import type { ResolvedType } from '../config';
import type { Context } from '../context';
import { emailFlows } from '../email-flows';
import { secondFactorFlows } from '../second-factor/flows';
import { signInCodeFlows } from '../sign-in-code';
import { stepUpFlows } from '../step-up/flows';
import type { AnyTypeApi } from './any-type-api';
import { passwordFlows } from './password-flows';
import { recordFlows } from './record-flows';

/**
 * Everything one user type answers, gathered from its flows: its records,
 * its password, its second factor, its sign-in code, its step-up and its e-mails.
 */
export function typeApi(context: Context, type: ResolvedType): AnyTypeApi {
	const at: At = (operation) =>
		context.config.single ? operation : `${type.name}.${operation}`;
	const secondFactor = secondFactorFlows(context, type, at);
	const signInCode = signInCodeFlows(context, type, at, secondFactor.finish);

	return {
		...recordFlows(context, type, at),
		...passwordFlows(context, type, at, secondFactor.finish),

		secondFactor: secondFactor.api,
		signInCode,
		stepUp: stepUpFlows(context, type, at),

		...emailFlows(context, type, at),
	};
}
