import getPort from 'get-port';

export { DEFAULT_PORT } from './constants.js';

/**
 * Resolve a port to bind on.
 *
 * - If `preferred > 0`, returns that port when it is free, otherwise a random free port.
 * - If `preferred === 0`, always returns a random free port.
 *
 * The port is not reserved past this call; the caller should bind quickly.
 */
export const resolvePort = async (preferred: number): Promise<number> => {
  if (preferred === 0) return getPort();
  return getPort({ port: preferred });
};
