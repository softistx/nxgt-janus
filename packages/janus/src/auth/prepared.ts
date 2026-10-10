/**
 * A request for an e-mail made in two steps — `prepare` counts it, `send`
 * issues — so the mail throttle answers in the visitor's own request, while
 * the lookup and the writes, whose time depends on whether the address has
 * an account, run off it.
 *
 * `prepare` looks nobody up: it validates, counts the address
 * (`mail-requests.ts`) and refuses past the limit, the same store calls for
 * any address. `send` is what `request` does after the count, **once**: the
 * count `prepare` made pays for one issue, so a second call is a `TypeError`
 * — a bug of the caller's, never a value from a request — and nothing a
 * caller can pass skips the count.
 */

/**
 * `send` for a prepared request: `issue` on the first call, a `TypeError`
 * on every other — marked spent before `issue` starts, so two calls at once
 * cannot both issue, and spent even when `issue` fails: prepare again then,
 * which counts again.
 */
export function sendOnce<T>(
	where: string,
	issue: () => Promise<T>,
): () => Promise<T> {
	let sent = false;
	return async () => {
		if (sent) {
			throw new TypeError(
				`${where}(…).send: already called — a prepared request sends once; call ${where} again for another`,
			);
		}
		sent = true;
		return issue();
	};
}
