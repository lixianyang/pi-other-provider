# pi-other-provider

Native [pi](https://github.com/earendil-works/pi) providers that are not bundled with pi itself.

The first provider is `ollama-cloud`. It discovers the Ollama Cloud model catalog, reads model capabilities and context
windows, and delegates inference to pi's existing OpenAI-compatible streaming implementation.

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
therefore reflect the catalog available to that credential. API keys are resolved by pi and are never written by this
package.

## License

[MIT](LICENSE)
