/**
 * The host we should *connect* to when the server is bound to `bindHost`.
 *
 * Binding to `0.0.0.0`, `::`, or an empty string means "listen on every
 * interface". Those are not useful destination addresses for the
 * discovery probe (`0.0.0.0` is not routable on many platforms) and
 * they are not stable URLs to advertise, so we collapse them to the
 * loopback equivalent. `localhost` is already a destination name, so
 * we leave it alone — resolvers decide whether it's IPv4 or IPv6.
 */
export const connectHost = (bindHost: string): string => {
  const normalized = bindHost.trim().toLowerCase();
  if (normalized === '' || normalized === '0.0.0.0') return '127.0.0.1';
  if (normalized === '::' || normalized === '[::]') return '::1';
  return bindHost;
};

/**
 * Wrap a host for use in an HTTP URL. IPv6 hosts must be bracketed so
 * `http://[::1]:4977` parses correctly.
 */
export const urlHost = (host: string): string => {
  // Already bracketed.
  if (host.startsWith('[')) return host;
  // Bare IPv6 literal (contains a colon but no dots) — bracket it.
  if (host.includes(':') && !host.includes('.')) return `[${host}]`;
  return host;
};
