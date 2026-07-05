// Detects whether the SPA is being served under the dedicated customer-portal
// hostname (e.g. portal.ramboeck.it) instead of the main app host
// (app.ramboeck.it/portal). On the portal host the portal lives at the root
// path, so path-based checks and URL cleanups must use '' as the base instead
// of the '/portal' prefix the main app uses.
export const isPortalHost = (): boolean =>
  typeof window !== 'undefined' &&
  /^portal\./i.test(window.location.hostname);

// Base path of the portal for the current host: '' on the portal host
// (portal at root), '/portal' on the main app host.
export const portalBasePath = (): string => (isPortalHost() ? '' : '/portal');

// Absolute path to the portal home for the current host ('/' vs '/portal').
export const portalHomePath = (): string => portalBasePath() || '/';
