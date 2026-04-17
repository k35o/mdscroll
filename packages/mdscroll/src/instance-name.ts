// Keep instance names safe to embed in filesystem paths. Lock and log
// files are written as `~/.mdscroll/<name>.lock` and `<name>.log`, so a
// name containing `/`, `\`, or a traversal component would escape the
// sandbox directory and let the CLI touch arbitrary files.
const INSTANCE_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const MAX_INSTANCE_NAME_LENGTH = 64;

export const isValidInstanceName = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_INSTANCE_NAME_LENGTH) {
    return false;
  }
  if (!INSTANCE_NAME_PATTERN.test(value)) return false;
  // Explicitly reject parent-traversal components even though the
  // regex already forbids `/` — a defence-in-depth guard for anyone
  // who later loosens the pattern.
  if (value === '.' || value === '..') return false;
  return true;
};

export const assertValidInstanceName = (value: unknown): string => {
  if (!isValidInstanceName(value)) {
    throw new Error(
      `mdscroll: invalid --name "${String(value)}" — allowed: ${MAX_INSTANCE_NAME_LENGTH} chars, starts with [A-Za-z0-9_], then [A-Za-z0-9._-]`,
    );
  }
  return value;
};
