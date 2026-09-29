/**
 * Devices: the signed token a client keeps (`token.ts`), what a sign-in was
 * told of the device and what it answers (`hint.ts`), and the event a new
 * one sends (`report.ts`).
 *
 * Gathered here from the files beside this one.
 */

export {
	type DeviceHint,
	type DeviceOutcome,
	deviceHint,
	deviceOutcome,
	UNTRACKED,
} from './hint';
export { reportNewDevice } from './report';
