import { describe, expect, it } from "vitest";
import { providerFactories } from "../src/providers/index.ts";

describe("provider registry", () => {
	it("contains unique native provider IDs", () => {
		const providers = providerFactories.map((createProvider) => createProvider());
		const ids = providers.map((provider) => provider.id);

		expect(ids).toEqual(["ollama-cloud"]);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
