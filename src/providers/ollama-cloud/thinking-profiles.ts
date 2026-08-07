import type { ThinkingLevelMap } from "@earendil-works/pi-ai";

const STANDARD_THINKING_LEVELS: ThinkingLevelMap = {
	off: "none",
	minimal: null,
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: null,
	max: null,
};

const GPT_OSS_THINKING_LEVELS: ThinkingLevelMap = {
	off: null,
	minimal: null,
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: null,
	max: null,
};

export function ollamaCloudThinkingLevels(modelId: string): ThinkingLevelMap {
	return /^gpt-oss(?::|$)/i.test(modelId) ? GPT_OSS_THINKING_LEVELS : STANDARD_THINKING_LEVELS;
}
