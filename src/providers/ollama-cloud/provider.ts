import { type Api, envApiKeyAuth, type Model, type Provider, type ProviderStreamOptions } from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/compat";
import { type OllamaCloudCatalogClient, OllamaCloudClient, type OllamaCloudModelInspection } from "./client.ts";
import { OLLAMA_CLOUD_INFERENCE_URL, OLLAMA_CLOUD_PROVIDER_ID, toOllamaCloudModel } from "./model-mapper.ts";
import { GENERATED_OLLAMA_CLOUD_MODELS } from "./models.generated.ts";

export const OLLAMA_CLOUD_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface OllamaCloudProviderOptions {
	baselineModels?: readonly Model<"openai-completions">[];
	createClient?: (apiKey: string) => OllamaCloudCatalogClient;
	now?: () => number;
	refreshIntervalMs?: number;
}

function isOllamaCloudModel(model: Model<Api>): model is Model<"openai-completions"> {
	return model.provider === OLLAMA_CLOUD_PROVIDER_ID && model.api === "openai-completions";
}

function refreshedModels(
	inspections: readonly OllamaCloudModelInspection[],
	previousModels: readonly Model<"openai-completions">[],
): { mappedSuccesses: number; models: Model<"openai-completions">[] } {
	const previousById = new Map(previousModels.map((model) => [model.id, model]));
	const nextById = new Map<string, Model<"openai-completions">>();
	let mappedSuccesses = 0;

	for (const inspection of inspections) {
		if (inspection.ok) {
			const mapped = toOllamaCloudModel(inspection.id, inspection.details);
			if (mapped) {
				mappedSuccesses++;
				nextById.set(mapped.id, mapped);
			}
			continue;
		}
		const previous = previousById.get(inspection.id);
		if (previous) nextById.set(previous.id, previous);
	}

	return { mappedSuccesses, models: [...nextById.values()] };
}

export function createOllamaCloudProvider(options: OllamaCloudProviderOptions = {}): Provider<"openai-completions"> {
	let models = [...(options.baselineModels ?? GENERATED_OLLAMA_CLOUD_MODELS)];
	const createClient = options.createClient ?? ((apiKey: string) => new OllamaCloudClient({ apiKey }));
	const now = options.now ?? Date.now;
	const refreshIntervalMs = options.refreshIntervalMs ?? OLLAMA_CLOUD_REFRESH_INTERVAL_MS;

	return {
		id: OLLAMA_CLOUD_PROVIDER_ID,
		name: "Ollama Cloud",
		baseUrl: OLLAMA_CLOUD_INFERENCE_URL,
		auth: {
			apiKey: envApiKeyAuth("Ollama Cloud API key", ["OLLAMA_API_KEY"]),
		},
		getModels: () => models,
		refreshModels: async (context): Promise<void> => {
			const { signal, stored } = context;
			if (stored) {
				const restored = stored.models.filter(isOllamaCloudModel);
				const published = await context.publish({
					update: () => {
						models = restored;
					},
				});
				if (!published) return;
			}

			if (!context.allowNetwork || signal.aborted) return;
			if (!context.force && stored?.checkedAt !== undefined && now() - stored.checkedAt < refreshIntervalMs) {
				return;
			}
			if (context.credential?.type !== "api_key" || !context.credential.key) return;

			const inspections = await createClient(context.credential.key).discoverModels(signal);
			signal.throwIfAborted();
			if (inspections.length === 0) {
				throw new Error("Ollama Cloud returned an empty model catalog; keeping the cached catalog");
			}
			const refreshed = refreshedModels(inspections, models);
			if (refreshed.mappedSuccesses === 0) {
				const firstFailure = inspections.find((inspection) => !inspection.ok);
				throw new Error(
					`Ollama Cloud returned no usable model details; keeping the cached catalog${firstFailure ? `. First failure: ${firstFailure.error.message}` : ""}`,
				);
			}
			const entry = { models: refreshed.models, checkedAt: now() };
			await context.publish({
				persist: entry,
				update: () => {
					models = refreshed.models;
				},
			});
		},
		stream: (model, context, options) => stream(model, context, options as ProviderStreamOptions | undefined),
		streamSimple: (model, context, options) => streamSimple(model, context, options),
	};
}
