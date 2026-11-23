// Keep Better Auth and the optimistic proxy check on the same cookie namespace.
// The default preserves existing production sessions.
export const authCookiePrefix = process.env.BETTER_AUTH_COOKIE_PREFIX || "better-auth";
