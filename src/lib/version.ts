import pkg from "../../package.json";

/**
 * Shown in the rail and on the login page; bump `version` in package.json when a block is closed.
 * Read at request time so the test deployment (APP_CHANNEL=beta) and production differ with the same build.
 */
export const versionLabel = () => `Versión ${pkg.version}${process.env.APP_CHANNEL === "beta" ? " · beta" : ""}`;
