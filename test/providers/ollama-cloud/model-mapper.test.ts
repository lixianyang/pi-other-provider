import { describe, expect, it } from "vitest";
import { toOllamaCloudModel } from "../../../src/providers/ollama-cloud/model-mapper.ts";

describe("toOllamaCloudModel", () => {
	it("maps context, vision, tools, and conservative thinking levels", () => {
		const model = toOllamaCloudModel("vision-reasoner", {
			capabilities: ["completion", "tools", "vision", "thinking"],
			modelInfo: { "small.context_length": 8192, "large.context_length": 262144 },
		});

		expect(model).toMatchObject({
			provider: "ollama-cloud",
			api: "openai-completions",
			input: ["text", "image"],
			reasoning: true,
			contextWindow: 262144,
			maxTokens: 32768,
			thinkingLevelMap: { off: "none", low: "low", medium: "medium", high: "high", xhigh: null },
			compat: { maxTokensField: "max_tokens", supportsStrictMode: false },
		});
	});

	it("does not expose unsupported GPT-OSS off mode", () => {
		const model = toOllamaCloudModel("gpt-oss:120b", {
			capabilities: ["tools", "thinking"],
			modelInfo: { "gptoss.context_length": 131072 },
		});

		expect(model?.thinkingLevelMap?.off).toBeNull();
	});

	it("prefers the declared architecture context over unrelated context fields", () => {
		const model = toOllamaCloudModel("architecture-context", {
			capabilities: ["tools"],
			modelInfo: {
				"general.architecture": "text",
				"text.context_length": 131_072,
				"vision.context_length": 262_144,
			},
		});

		expect(model?.contextWindow).toBe(131_072);
	});

	it("filters models without tool support", () => {
		expect(
			toOllamaCloudModel("chat-only", {
				capabilities: ["completion"],
				modelInfo: { "test.context_length": 4096 },
			}),
		).toBeUndefined();
	});

	it("uses safe context and output defaults when metadata is absent", () => {
		const model = toOllamaCloudModel("fallback", { capabilities: ["tools"], modelInfo: {} });

		expect(model).toMatchObject({ contextWindow: 128000, maxTokens: 32768, reasoning: false });
		expect(model?.compat?.supportsReasoningEffort).toBe(false);
	});
});
