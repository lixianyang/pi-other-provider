import { InMemoryModelsStore, type Model, type Provider, type RefreshModelsContext } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type {
	OllamaCloudCatalogClient,
	OllamaCloudModelDetails,
	OllamaCloudModelInspection,
} from "../../../src/providers/ollama-cloud/client.ts";
import { toOllamaCloudModel } from "../../../src/providers/ollama-cloud/model-mapper.ts";
import { createOllamaCloudProvider } from "../../../src/providers/ollama-cloud/provider.ts";

const signal = new AbortController().signal;

function details(contextWindow = 128000): OllamaCloudModelDetails {
	return { capabilities: ["tools"], modelInfo: { "test.context_length": contextWindow } };
}

function model(id: string, contextWindow = 128000): Model<"openai-completions"> {
	const mapped = toOllamaCloudModel(id, details(contextWindow));
	if (!mapped) throw new Error("Test model should support tools");
	return mapped;
}

async function refresh(
	provider: Provider,
	store: InMemoryModelsStore,
	overrides: Partial<Pick<RefreshModelsContext, "allowNetwork" | "credential" | "force">> = {},
): Promise<void> {
	await provider.refreshModels?.({
		credential: overrides.credential ?? { type: "api_key", key: "test-key" },
		stored: await store.read(provider.id),
		publish: async ({ persist, update }) => {
			if (persist === null) await store.delete(provider.id);
			else if (persist !== undefined) await store.write(provider.id, persist);
			update?.();
			return true;
		},
		allowNetwork: overrides.allowNetwork ?? true,
		force: overrides.force,
		signal,
	});
}

function stubClient(inspections: readonly OllamaCloudModelInspection[]): OllamaCloudCatalogClient {
	return { discoverModels: vi.fn(async () => inspections) };
}

describe("createOllamaCloudProvider", () => {
	it("starts with the generated-style baseline and restores Pi's cached catalog offline", async () => {
		const provider = createOllamaCloudProvider({ baselineModels: [model("baseline")] });
		const store = new InMemoryModelsStore();
		await store.write(provider.id, { models: [model("cached", 64000)], checkedAt: 1 });

		expect(provider.getModels().map((entry) => entry.id)).toEqual(["baseline"]);
		await refresh(provider, store, { allowNetwork: false });
		expect(provider.getModels().map((entry) => entry.id)).toEqual(["cached"]);
	});

	it("honors catalog freshness without creating a separate cache", async () => {
		const createClient = vi.fn(() => stubClient([]));
		const provider = createOllamaCloudProvider({
			baselineModels: [model("baseline")],
			createClient,
			now: () => 10_000,
			refreshIntervalMs: 1_000,
		});
		const store = new InMemoryModelsStore();
		await store.write(provider.id, { models: [model("cached")], checkedAt: 9_500 });

		await refresh(provider, store);

		expect(createClient).not.toHaveBeenCalled();
		expect(provider.getModels().map((entry) => entry.id)).toEqual(["cached"]);
	});

	it("merges failed details by current IDs and removes retired IDs", async () => {
		const inspections: OllamaCloudModelInspection[] = [
			{ id: "kept", ok: false, error: new Error("temporary") },
			{ id: "new", ok: true, details: details(262144) },
		];
		const provider = createOllamaCloudProvider({
			baselineModels: [],
			createClient: () => stubClient(inspections),
			now: () => 20_000,
			refreshIntervalMs: 0,
		});
		const store = new InMemoryModelsStore();
		await store.write(provider.id, { models: [model("kept", 64000), model("retired")], checkedAt: 1 });

		await refresh(provider, store);

		expect(provider.getModels().map((entry) => entry.id)).toEqual(["kept", "new"]);
		expect(provider.getModels().find((entry) => entry.id === "kept")?.contextWindow).toBe(64000);
		expect((await store.read(provider.id))?.models.map((entry) => entry.id)).toEqual(["kept", "new"]);
	});

	it("keeps the previous catalog when every detail request fails", async () => {
		const failure = new Error("request failed: model details unavailable");
		const provider = createOllamaCloudProvider({
			baselineModels: [],
			createClient: () => stubClient([{ id: "cached", ok: false, error: failure }]),
			refreshIntervalMs: 0,
		});
		const store = new InMemoryModelsStore();
		await store.write(provider.id, { models: [model("cached")], checkedAt: 1 });

		await expect(refresh(provider, store)).rejects.toThrow(failure.message);
		expect(provider.getModels().map((entry) => entry.id)).toEqual(["cached"]);
		expect((await store.read(provider.id))?.checkedAt).toBe(1);
	});

	it("keeps the previous catalog when no discovered model supports tools", async () => {
		const provider = createOllamaCloudProvider({
			baselineModels: [],
			createClient: () =>
				stubClient([
					{
						id: "chat-only",
						ok: true,
						details: { capabilities: ["completion"], modelInfo: { "test.context_length": 64_000 } },
					},
				]),
			refreshIntervalMs: 0,
		});
		const store = new InMemoryModelsStore();
		await store.write(provider.id, { models: [model("cached")], checkedAt: 1 });

		await expect(refresh(provider, store)).rejects.toThrow("no usable model details");
		expect(provider.getModels().map((entry) => entry.id)).toEqual(["cached"]);
		expect((await store.read(provider.id))?.checkedAt).toBe(1);
	});

	it("keeps the previous catalog when discovery returns an empty list", async () => {
		const provider = createOllamaCloudProvider({
			baselineModels: [model("baseline")],
			createClient: () => stubClient([]),
			now: () => 30_000,
			refreshIntervalMs: 0,
		});
		const store = new InMemoryModelsStore();
		await store.write(provider.id, { models: [model("cached")], checkedAt: 1 });

		await expect(refresh(provider, store)).rejects.toThrow("empty model catalog");

		expect(provider.getModels().map((entry) => entry.id)).toEqual(["cached"]);
		expect(await store.read(provider.id)).toMatchObject({
			models: [expect.objectContaining({ id: "cached" })],
			checkedAt: 1,
		});
	});

	it("stops when cached publication loses the refresh generation", async () => {
		const createClient = vi.fn(() => stubClient([]));
		const provider = createOllamaCloudProvider({
			baselineModels: [model("baseline")],
			createClient,
		});
		const context: RefreshModelsContext = {
			credential: { type: "api_key" as const, key: "test-key" },
			stored: { models: [model("cached")], checkedAt: 1 },
			allowNetwork: true,
			signal,
			publish: vi.fn(async () => false),
		};

		await provider.refreshModels?.(context);

		expect(context.publish).toHaveBeenCalledOnce();
		expect(provider.getModels().map((entry) => entry.id)).toEqual(["baseline"]);
		expect(createClient).not.toHaveBeenCalled();
	});

	it("does not update in-memory models when refreshed publication loses the generation", async () => {
		const provider = createOllamaCloudProvider({
			baselineModels: [model("baseline")],
			createClient: () => stubClient([{ id: "current", ok: true, details: details(262_144) }]),
			refreshIntervalMs: 0,
		});
		const context: RefreshModelsContext = {
			credential: { type: "api_key", key: "test-key" },
			allowNetwork: true,
			signal,
			publish: vi.fn(async () => false),
		};

		await provider.refreshModels?.(context);

		expect(context.publish).toHaveBeenCalledOnce();
		expect(context.publish).toHaveBeenCalledWith({
			persist: expect.objectContaining({ models: [expect.objectContaining({ id: "current" })] }),
			update: expect.any(Function),
		});
		expect(provider.getModels().map((entry) => entry.id)).toEqual(["baseline"]);
	});
});
