# Contributing

Thanks for helping expand the providers available to pi.

## Development setup

Requirements:

- Node.js 22.19 or newer
- npm 12
- pi 0.84.0 or newer for manual integration testing

Install dependencies without running lifecycle scripts:

```bash
npm install --ignore-scripts
```

Run the same checks used by CI and releases:

```bash
npm run release:check
```

For a focused development loop:

```bash
npm run check
npm test
```

## Testing the extension locally

Run a checkout for one pi invocation:

```bash
pi -e /absolute/path/to/pi-other-provider
```

Never commit API keys or include them in issues, test fixtures, recordings, or screenshots.

## Provider architecture

Each provider lives under `src/providers/<provider-id>/` and owns its authentication metadata, catalog discovery, model
mapping, and pi provider implementation. Register a provider in `src/providers/index.ts`.

Keep provider-specific behavior isolated. Add shared abstractions only after at least two providers need the same
behavior. Provider-specific commands, configuration files, and UI should be avoided unless they solve a demonstrated
user need.

For catalog-backed providers:

- Preserve the last known good catalog on transient, empty, or suspicious responses.
- Publish refreshed catalogs atomically through pi's provider API.
- Keep concurrency, timeouts, abort handling, and error messages covered by tests.
- Never persist credentials.

The Ollama Cloud offline catalog is generated with:

```bash
npm run generate:ollama-cloud-models
```

Commit generated catalog changes together with the source or metadata change that requires them.

## Pull requests

- Keep changes focused and explain user-visible behavior.
- Add or update tests for behavior changes.
- Update `README.md` and `CHANGELOG.md` when appropriate.
- Ensure `npm run release:check` passes.
- Resolve all review conversations before merging.

## Release process

Maintainers release from the protected `main` branch:

1. Update `package.json` and `package-lock.json` to the intended version.
2. Move relevant entries from `Unreleased` in `CHANGELOG.md` into a dated version section.
3. Merge the release pull request after all required checks pass.
4. Publish a GitHub Release whose tag is exactly `v<package-version>`.
5. The `Publish npm package` workflow verifies the tag and package version, runs release checks, and publishes through
   npm Trusted Publishing.

Do not publish manually or reuse a version that already exists on npm.
