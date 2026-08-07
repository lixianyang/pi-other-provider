import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSessionServices } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const extensionPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
let agentDir: string;
let previousApiKey: string | undefined;

beforeAll(async () => {
	agentDir = await mkdtemp(join(tmpdir(), "pi-other-provider-test-"));
	previousApiKey = process.env.OLLAMA_API_KEY;
	process.env.OLLAMA_API_KEY = "integration-test-placeholder";
});

afterAll(async () => {
	if (previousApiKey === undefined) delete process.env.OLLAMA_API_KEY;
	else process.env.OLLAMA_API_KEY = previousApiKey;
	await rm(agentDir, { recursive: true, force: true });
});

describe("pi extension integration", () => {
	it("loads through pi 0.84 and exposes the offline Ollama Cloud catalog", async () => {
		const services = await createAgentSessionServices({
			cwd: process.cwd(),
			agentDir,
			resourceLoaderOptions: {
				additionalExtensionPaths: [extensionPath],
				noContextFiles: true,
				noPromptTemplates: true,
				noSkills: true,
				noThemes: true,
			},
		});

		const extensions = services.resourceLoader.getExtensions();
		expect({
			diagnostics: services.diagnostics,
			errors: extensions.errors,
			extensions: extensions.extensions.map((extension) => extension.path),
		}).toEqual({ diagnostics: [], errors: [], extensions: [extensionPath] });
		expect(services.modelRuntime.getProvider("ollama-cloud")).toBeDefined();
		const models = await services.modelRuntime.getAvailable("ollama-cloud");
		expect(models.length).toBeGreaterThan(0);
		expect(new Set(models.map((model) => model.provider))).toEqual(new Set(["ollama-cloud"]));
	});
});
