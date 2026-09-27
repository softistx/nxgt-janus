/**
 * The user events' shared setup: an instance whose listener records what
 * it hears, unless a case hands it another. Specs only — no case lives here.
 */

import { hasher, person } from '../../test/auth';
import { fixedClock } from '../time/clock';
import type { UserEvent, UserEventListener } from './events';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import type { JanusStores } from './port/types';

export function setup(events?: UserEventListener, store?: JanusStores) {
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const received: UserEvent[] = [];
	const auth = janus({
		user: person,
		password: { login: 'email' },
		store: store ?? createMemoryStores(),
		hasher,
		clock,
		events:
			events ??
			((event) => {
				received.push(event);
			}),
	});
	return { auth, clock, received };
}

export const types = (events: readonly UserEvent[]) =>
	events.map((e) => e.type);
