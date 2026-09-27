/** One call of a flow, as the events read it. */
export interface Call {
	/** `signIn`, `verifyEmail.confirm`: the flow without the user type. */
	readonly flow: string;
	readonly userType: string | undefined;
	readonly args: readonly unknown[];
}
