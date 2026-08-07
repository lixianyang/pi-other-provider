import type { Model, OpenAICompletionsCompat } from "@earendil-works/pi-ai";
import type { OllamaCloudModelDetails } from "./client.ts";
import { ollamaCloudThinkingLevels } from "./thinking-profiles.ts";

export const OLLAMA_CLOUD_PROVIDER_ID = "ollama-cloud";
export const OLLAMA_CLOUD_INFERENCE_URL = "https://ollama.com/v1";
export const OLLAMA_CLOUD_DEFAULT_CONTEXT_WINDOW = 128_000;
export const OLLAMA_CLOUD_DEFAULT_MAX_TOKENS = 32_768;

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

const OLLAMA_OPENAI_COMPAT: OpenAICompletionsCompat = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: true,
	supportsUsageInStreaming: true,
	maxTokensField: "max_tokens",
	requiresToolResultName: false,
	requiresAssistantAfterToolResult: false,
	requiresThinkingAsText: false,
	requiresReasoningContentOnAssistantMessages: false,
	thinkingFormat: "openai",
	supportsOpenAIGrammarTools: false,
	supportsStrictMode: false,
	sendSessionAffinityHeaders: false,
	supportsLongCacheRetention: false,
};

function positiveContextLength(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function modelContextWindow(modelInfo: Readonly<Record<string, unknown>>): number {
	const architecture = modelInfo["general.architecture"];
	if (typeof architecture === "string" && architecture.trim()) {
		const architectureContext = positiveContextLength(modelInfo[`${architecture.trim()}.context_length`]);
		if (architectureContext !== undefined) return architectureContext;
	}

	// Older or provider-specific responses may omit general.architecture. In that
	// case, retain the largest advertised context window for backward compatibility.
	const candidates = Object.entries(modelInfo)
		.filter(([key]) => key.endsWith(".context_length"))
		.map(([, value]) => positiveContextLength(value))
		.filter((value): value is number => value !== undefined);
	return candidates.length > 0 ? Math.max(...candidates) : OLLAMA_CLOUD_DEFAULT_CONTEXT_WINDOW;
}

export function toOllamaCloudModel(
	id: string,
	details: OllamaCloudModelDetails,
): Model<"openai-completions"> | undefined {
	const capabilities = new Set(details.capabilities.map((capability) => capability.toLowerCase()));
	if (!capabilities.has("tools")) return undefined;

	const contextWindow = modelContextWindow(details.modelInfo);
	const reasoning = capabilities.has("thinking");
	return {
		id,
		name: id,
		api: "openai-completions",
		provider: OLLAMA_CLOUD_PROVIDER_ID,
		baseUrl: OLLAMA_CLOUD_INFERENCE_URL,
		reasoning,
		...(reasoning ? { thinkingLevelMap: ollamaCloudThinkingLevels(id) } : {}),
		input: capabilities.has("vision") ? ["text", "image"] : ["text"],
		cost: ZERO_COST,
		contextWindow,
		maxTokens: Math.min(contextWindow, OLLAMA_CLOUD_DEFAULT_MAX_TOKENS),
		compat: {
			...OLLAMA_OPENAI_COMPAT,
			supportsReasoningEffort: reasoning,
		},
	};
}
