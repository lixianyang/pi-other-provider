import { describe, expect, it, vi } from "vitest";
import { OllamaCloudClient } from "../../../src/providers/ollama-cloud/client.ts";

describe("OllamaCloudClient", () => {
	it("discovers models, preserves list order, and sends bearer auth", async () => {
		const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input, init) => {
			const url = new URL(String(input));
			if (url.pathname === "/api/tags") {
				return Response.json({ models: [{ model: "one" }, { name: "two" }, { model: "one" }] });
			}
			const body = JSON.parse(String(init?.body)) as { model: string };
			return Response.json({
				capabilities: ["completion", "tools"],
				model_info: { "test.context_length": body.model === "one" ? 1000 : 2000 },
			});
		});
		const client = new OllamaCloudClient({ apiKey: "secret", fetch: fetchImplementation, concurrency: 2 });

		const result = await client.discoverModels(new AbortController().signal);

		expect(result.map((entry) => entry.id)).toEqual(["one", "two"]);
		expect(fetchImplementation).toHaveBeenCalledTimes(3);
		for (const [, init] of fetchImplementation.mock.calls) {
			expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
		}
	});

	it("keeps per-model detail failures without discarding successful details", async () => {
		const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input, init) => {
			const url = new URL(String(input));
			if (url.pathname === "/api/tags") return Response.json({ models: [{ model: "good" }, { model: "bad" }] });
			const body = JSON.parse(String(init?.body)) as { model: string };
			return body.model === "good"
				? Response.json({ capabilities: ["tools"], model_info: {} })
				: new Response(null, { status: 503 });
		});
		const client = new OllamaCloudClient({ fetch: fetchImplementation });

		const result = await client.discoverModels(new AbortController().signal);

		expect(result[0]).toMatchObject({ id: "good", ok: true });
		expect(result[1]).toMatchObject({ id: "bad", ok: false });
	});

	it("limits concurrent detail requests while preserving catalog order", async () => {
		const ids = ["one", "two", "three", "four"];
		const pending: Array<() => void> = [];
		let active = 0;
		let maxActive = 0;
		const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input, init) => {
			const url = new URL(String(input));
			if (url.pathname === "/api/tags") return Response.json({ models: ids.map((model) => ({ model })) });

			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise<void>((resolve) => pending.push(resolve));
			active--;
			const body = JSON.parse(String(init?.body)) as { model: string };
			return Response.json({ capabilities: ["tools"], model_info: { model: body.model } });
		});
		const client = new OllamaCloudClient({ fetch: fetchImplementation, concurrency: 2 });

		const discovery = client.discoverModels(new AbortController().signal);
		await vi.waitFor(() => expect(pending).toHaveLength(2));
		pending.splice(0).forEach((resolve) => {
			resolve();
		});
		await vi.waitFor(() => expect(pending).toHaveLength(2));
		pending.splice(0).forEach((resolve) => {
			resolve();
		});
		const result = await discovery;

		expect(maxActive).toBe(2);
		expect(result.map((entry) => entry.id)).toEqual(ids);
	});

	it("aborts a request when its timeout expires", async () => {
		const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
			const requestSignal = init?.signal;
			if (!requestSignal) throw new Error("Expected a request signal");
			await new Promise<never>((_resolve, reject) => {
				if (requestSignal.aborted) {
					reject(requestSignal.reason);
					return;
				}
				requestSignal.addEventListener("abort", () => reject(requestSignal.reason), { once: true });
			});
			throw new Error("unreachable");
		});
		const client = new OllamaCloudClient({ fetch: fetchImplementation, timeoutMs: 20 });

		await expect(client.discoverModels(new AbortController().signal)).rejects.toThrow(
			"Ollama Cloud request timed out: /api/tags",
		);
		expect(fetchImplementation).toHaveBeenCalledOnce();
	});

	it("rejects malformed model lists", async () => {
		const client = new OllamaCloudClient({ fetch: async () => Response.json({ unexpected: [] }) });

		await expect(client.discoverModels(new AbortController().signal)).rejects.toThrow("invalid model list");
	});

	it("includes a truncated Ollama error detail in HTTP failures", async () => {
		const detail = `invalid API key: ${"x".repeat(1_000)}`;
		const client = new OllamaCloudClient({
			fetch: async () => Response.json({ error: detail }, { status: 401 }),
		});

		let failure: unknown;
		try {
			await client.discoverModels(new AbortController().signal);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(Error);
		const message = (failure as Error).message;
		expect(message).toContain("/api/tags (401): invalid API key");
		expect(message).toMatch(/\.\.\.$/);
		expect(message.length).toBeLessThan(600);
	});

	it("honors an already-aborted catalog refresh", async () => {
		const fetchImplementation = vi.fn<typeof globalThis.fetch>();
		const controller = new AbortController();
		controller.abort();
		const client = new OllamaCloudClient({ fetch: fetchImplementation });

		await expect(client.discoverModels(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
		expect(fetchImplementation).not.toHaveBeenCalled();
	});
});
