import { scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

// What the connect.*.spec.ts files share: the user schema, a fast hasher,
// and a new sign-up each time.

export const user = z.object({ email: z.email() });
export const hasher = scryptHasher({ cost: 10 });
let signUps = 0;
export const credentials = () => {
	signUps += 1;
	return { email: `ada${signUps}@example.test`, password: 'correct horse' };
};
