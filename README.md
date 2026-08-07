# pi-other-provider

[![CI](https://github.com/lixianyang/pi-other-provider/actions/workflows/ci.yml/badge.svg)](https://github.com/lixianyang/pi-other-provider/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40leesven%2Fpi-other-provider)](https://www.npmjs.com/package/@leesven/pi-other-provider)
[![license](https://img.shields.io/npm/l/%40leesven%2Fpi-other-provider)](LICENSE)

Native [pi](https://github.com/earendil-works/pi) providers that are not bundled with pi itself.

The first provider is `ollama-cloud`. It discovers the Ollama Cloud model catalog, reads model capabilities and context
windows, and delegates inference to pi's existing OpenAI-compatible streaming implementation.

## Providers

| Provider | Status | Authentication | Model catalog |
| --- | --- | --- | --- |
| Ollama Cloud (`ollama-cloud`) | Supported | `OLLAMA_API_KEY` or `/login ollama-cloud` | Automatic discovery with an offline fallback |

## Requirements

- pi 0.84.0 or newer
- Node.js 22.19 or newer
- An Ollama Cloud API key

## Install

Install the published package from npm:

```bash
pi install npm:@leesven/pi-other-provider
```

Or install the current source from GitHub:

```bash
pi install git:github.com/lixianyang/pi-other-provider
```

## Local development

Install a local checkout:

```bash
pi install /absolute/path/to/pi-other-provider
```

For one invocation during development:

```bash
pi -e /absolute/path/to/pi-other-provider
```

## Configure Ollama Cloud

Set the environment variable:

```bash
export OLLAMA_API_KEY="your-api-key"
```

Or start pi and use its standard login flow:

```text
/login ollama-cloud
```

Open `/model` to select an `ollama-cloud` model. Pi immediately uses the generated offline catalog or its persisted
catalog cache, then refreshes stale metadata in the background. Catalog entries are considered fresh for 24 hours.

The provider intentionally adds no provider-specific commands, cache files, configuration files, or UI.

## How model discovery works

The package ships a generated Ollama Cloud catalog so models are available before the first network refresh. When the
catalog is stale, the provider asks Ollama Cloud for the current model list and model details, maps capabilities such as
context windows, vision, and thinking support into pi's native model metadata, and publishes the result atomically.

Transient or suspicious catalog responses keep the last known good catalog. Runtime API keys are resolved by pi and are
never written by this package.

## Troubleshooting

### The extension is missing at startup

Confirm that the npm package is installed and avoid loading a local checkout at the same time:

```bash
pi list
```

Reinstall the published package if necessary:

```bash
pi remove npm:@leesven/pi-other-provider
pi install npm:@leesven/pi-other-provider
```

### Ollama Cloud models are missing

Confirm that `OLLAMA_API_KEY` is available to the process running pi, or run `/login ollama-cloud`. Then restart pi and
open `/model` again. A failed background refresh keeps the offline or last known good catalog rather than clearing it.

### Requests fail after selecting a model

Check that the API key is active and has access to Ollama Cloud. Do not paste API keys into issues, logs, screenshots, or
other public reports.

## Provider architecture

Each provider is an isolated native pi `Provider` implementation under `src/providers/<provider-id>/`. Adding another
provider requires a provider module and one entry in `src/providers/index.ts`; authentication, catalog discovery, and
model mapping remain provider-owned. Shared abstractions are added only when multiple providers need the same behavior.

## Development

```bash
npm install --ignore-scripts
npm run generate:ollama-cloud-models
npm run check
npm test
```

The generated catalog is public metadata fetched without an API key. Runtime refreshes use the configured key and can
therefore reflect the catalog available to that credential.

See [CONTRIBUTING.md](CONTRIBUTING.md) for provider architecture, testing expectations, and the release process.

## Security

Pi extensions execute with the permissions of the pi process. Review third-party extension source before installation.
To report a vulnerability, follow [SECURITY.md](SECURITY.md) and do not open a public issue.

## Releases

This project follows semantic versioning. While the package is below `1.0.0`, minor releases may include breaking
changes. Releases are published from GitHub Actions through npm Trusted Publishing; the Git tag and `package.json`
version must match.

## License

[MIT](LICENSE)
