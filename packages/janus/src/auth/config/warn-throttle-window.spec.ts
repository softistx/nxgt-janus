import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { person } from '../../../test/auth';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusConfig } from './janus-config';

const store = createMemoryStores();
type Config = Omit<JanusConfig, 'user' | 'users' | 'store'>;

const wire = (config: Config) =>
	janus({ user: person, store, ...config } as Parameters<typeof janus>[0]);

describe('the mail throttle window against the token lifetimes', () => {
	let warn: ReturnType<typeof spyOn<typeof process, 'emitWarning'>>;
	beforeEach(() => {
		warn = spyOn(process, 'emitWarning').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	it('warns once, naming the flow, both durations and the fix, when a lifetime is shorter', () => {
		wire({ tokens: { signInCode: '5m' } });

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			'janus: tokens.signInCode is 5m, shorter than mail.throttle.window, 10m — past the limit the last token sent can expire before the refusal ends. Set mail.throttle.window to 5m or less, or raise tokens.signInCode to 10m or more.',
			{ code: 'JANUS_THROTTLE_WINDOW' },
		);
	});

	it('names every flow that is shorter, in one warning', () => {
		wire({
			tokens: { magicLink: '2m', signInCode: '3m', stepUp: '30s' },
			mail: { throttle: { window: '1h' } },
		});

		expect(warn).toHaveBeenCalledTimes(1);
		const message = String(warn.mock.calls[0]?.[0]);
		expect(message).toContain('tokens.magicLink is 2m');
		expect(message).toContain('tokens.signInCode is 3m');
		expect(message).toContain('tokens.stepUp is 30s');
		expect(message).toContain('Set mail.throttle.window to 30s or less');
	});

	it('is silent with the defaults, and when a lifetime equals or exceeds the window', () => {
		wire({});
		wire({ tokens: { signInCode: '10m', stepUp: '1h' } });
		wire({
			tokens: { signInCode: '1h', magicLink: '1h', stepUp: '1h' },
			mail: { throttle: { window: '1h' } },
		});

		expect(warn).not.toHaveBeenCalled();
	});

	it('is silent when the throttle is off', () => {
		wire({ tokens: { signInCode: '1m' }, mail: { throttle: false } });

		expect(warn).not.toHaveBeenCalled();
	});

	it('does not throw where the runtime has no process.emitWarning', () => {
		const original = process.emitWarning;
		// @ts-expect-error a runtime without it
		process.emitWarning = undefined;
		try {
			expect(() => wire({ tokens: { signInCode: '1m' } })).not.toThrow();
		} finally {
			process.emitWarning = original;
		}
	});
});
