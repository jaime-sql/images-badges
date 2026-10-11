/**
 * Node's type stripper does not rewrite extensionless imports inside .ts files.
 * Next resolves those itself; this hook is only for the unit-test runner.
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !specifier.endsWith('.ts') &&
    !specifier.endsWith('.js') &&
    !specifier.endsWith('.mjs') &&
    !specifier.endsWith('.json')
  ) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
