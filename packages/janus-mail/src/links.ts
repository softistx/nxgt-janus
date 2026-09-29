/**
 * `janusMail()`'s `links`, checked once when it is called and copied, so
 * the guarantee made there holds at every send. A mistake is a wiring
 * mistake: a bare `TypeError` naming the link, never its value.
 */
import { refuse } from './refuse';
import type { JanusMailLinks } from './types';

/** The links every `janusMail()` needs: checked, then copied, by these names. */
const REQUIRED_LINKS = [
	'verifyEmail',
	'resetPassword',
	'secureAccount',
	'getStarted',
] as const;

/**
 * The links a `janusMail()` may leave out: `recoveryCodes` falls back to
 * `secureAccount`; `magicLink` has none, and its send is refused without it.
 */
const OPTIONAL_LINKS = ['recoveryCodes', 'magicLink'] as const;

/** `links`: an object of functions, every required one there. */
export function checkLinks(
	links: unknown,
): asserts links is Record<string, unknown> {
	if (typeof links !== 'object' || links === null || Array.isArray(links)) {
		refuse(
			'links must be an object, as { verifyEmail, resetPassword, secureAccount, getStarted }',
		);
	}
	const given = links as Record<string, unknown>;
	for (const name of REQUIRED_LINKS) {
		if (typeof given[name] !== 'function') {
			refuse(`links.${name} must be a function`);
		}
	}
	for (const name of OPTIONAL_LINKS) {
		if (given[name] !== undefined && typeof given[name] !== 'function') {
			refuse(`links.${name} must be a function, or left out`);
		}
	}
}

/**
 * A frozen copy of the checked links, each bound to the caller's object — a
 * class instance's methods keep their `this` — so replacing a link after
 * `janusMail()` cannot undo the check. An optional link left out stays out.
 */
export function frozenLinks(links: JanusMailLinks): JanusMailLinks {
	const given = links as unknown as Record<
		string,
		((...args: never[]) => unknown) | undefined
	>;
	const names = [
		...REQUIRED_LINKS,
		...OPTIONAL_LINKS.filter((name) => given[name] !== undefined),
	];
	// Every name kept was checked a function by checkLinks.
	return Object.freeze(
		Object.fromEntries(
			names.map((name) => [
				name,
				(given[name] as (...args: never[]) => unknown).bind(links),
			]),
		),
	) as unknown as JanusMailLinks;
}
