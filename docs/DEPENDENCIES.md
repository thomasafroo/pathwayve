# Dependency notes

Setup audit (2026-10-03): production dependencies have no reported advisories.
The development lint dependency chain has five high-severity audit entries from
one underlying advisory in `braces`, through `micromatch`, `fast-glob`, and the
Next.js ESLint plugin/configuration:

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

No compatible patched release was offered by the audit. Its suggested forced fix
downgrades `eslint-config-next` to version 14, mismatching Next.js 16. Do not use
`npm audit fix --force` for that change. Recheck upstream patches with `npm audit`.
This dependency processes file globs in development/CI, not trip API inputs.

ESLint 9 is retained because the current `eslint-plugin-react` peer dependency
supports up to ESLint 9. Update the lint stack together when its peers support a
newer major. The lockfile makes teammate and CI installs reproducible.
