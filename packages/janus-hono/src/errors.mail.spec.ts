import { describe, expect, it } from 'bun:test';
import { MailThrottledError } from '@nxgt/janus';
import { Hono } from 'hono';
import { bodyOf, janusErrors, statusOf } from './errors';

const throttled = () =>
	new MailThrottledError(
		'magicLink.request: too many e-mails asked for this address — wait for the next window',
		{ userType: 'user', retryAfter: 840 },
	);

describe('janusErrors(), a request past its e-mails', () => {
	it('answers 429 with retryAfter and the Retry-After header', async () => {
		const app = new Hono().post('/sign-in/link', () => {
			throw throttled();
		});
		app.onError(janusErrors());

		const response = await app.request('/sign-in/link', { method: 'POST' });

		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('840');
		expect(await response.json()).toEqual({
			code: 'MAIL_THROTTLED',
			retryAfter: 840,
		});
	});

	it('reads the same through bodyOf() and statusOf(), with no user type', () => {
		expect(statusOf('MAIL_THROTTLED')).toBe(429);
		expect(bodyOf(throttled())).toEqual({
			code: 'MAIL_THROTTLED',
			retryAfter: 840,
		});
	});
});
