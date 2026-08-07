export const OLLAMA_CLOUD_API_URL = "https://ollama.com";

const DEFAULT_DETAIL_CONCURRENCY = 6;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_ERROR_DETAIL_LENGTH = 500;

export interface OllamaCloudModelDetails {
	capabilities: readonly string[];
	modelInfo: Readonly<Record<string, unknown>>;
}

export type OllamaCloudModelInspection =
	| { id: string; ok: true; details: OllamaCloudModelDetails }
	| { id: string; ok: false; error: Error };

export interface OllamaCloudCatalogClient {
	discoverModels(signal: AbortSignal): Promise<readonly OllamaCloudModelInspection[]>;
}

export interface OllamaCloudClientOptions {
	apiKey?: string;
	baseUrl?: string;
	concurrency?: number;
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseModelIds(payload: unknown): string[] {
	if (!isRecord(payload) || !Array.isArray(payload.models)) {
		throw new Error("Ollama Cloud returned an invalid model list");
	}

	const ids: string[] = [];
	const seen = new Set<string>();
	for (const entry of payload.models) {
		if (!isRecord(entry)) continue;
		const candidate = typeof entry.model === "string" ? entry.model : entry.name;
		if (typeof candidate !== "string") continue;
		const id = candidate.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	if (payload.models.length > 0 && ids.length === 0) {
		throw new Error("Ollama Cloud returned an invalid model list");
	}
	return ids;
}

function parseModelDetails(payload: unknown): OllamaCloudModelDetails {
	if (!isRecord(payload) || !Array.isArray(payload.capabilities) || !isRecord(payload.model_info)) {
		throw new Error("Ollama Cloud returned invalid model details");
	}
	if (!payload.capabilities.every((capability) => typeof capability === "string")) {
		throw new Error("Ollama Cloud returned invalid model capabilities");
	}
	return {
		capabilities: payload.capabilities,
		modelInfo: payload.model_info,
	};
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export class OllamaCloudClient implements OllamaCloudCatalogClient {
	private readonly apiKey: string | undefined;
	private readonly baseUrl: string;
	private readonly concurrency: number;
	private readonly fetchImplementation: typeof globalThis.fetch;
	private readonly timeoutMs: number;

	constructor(options: OllamaCloudClientOptions = {}) {
		this.apiKey = options.apiKey;
		this.baseUrl = (options.baseUrl ?? OLLAMA_CLOUD_API_URL).replace(/\/+$/, "");
		this.concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_DETAIL_CONCURRENCY));
		this.fetchImplementation = options.fetch ?? globalThis.fetch;
		this.timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS));
	}

	private async request(path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
		signal.throwIfAborted();
		const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
		const requestSignal = AbortSignal.any([signal, timeoutSignal]);
		const headers = new Headers(init.headers);
		headers.set("accept", "application/json");
		if (this.apiKey) headers.set("authorization", `Bearer ${this.apiKey}`);

		let response: Response;
		try {
			response = await this.fetchImplementation(new URL(path, `${this.baseUrl}/`), {
				...init,
				headers,
				signal: requestSignal,
			});
		} catch (error) {
			if (signal.aborted) signal.throwIfAborted();
			if (timeoutSignal.aborted) throw new Error(`Ollama Cloud request timed out: ${path}`, { cause: error });
			throw error;
		}

		if (!response.ok) {
			let detail: string | undefined;
			try {
				const body = (await response.text()).trim();
				if (body) {
					detail = body;
					try {
						const parsed = JSON.parse(body) as unknown;
						if (isRecord(parsed) && typeof parsed.error === "string" && parsed.error.trim()) {
							detail = parsed.error.trim();
						}
					} catch {
						// Keep the plain response body when it is not JSON.
					}
				}
			} catch {
				// The status code remains useful when the response body cannot be read.
			}
			if (detail && detail.length > MAX_ERROR_DETAIL_LENGTH) {
				detail = `${detail.slice(0, MAX_ERROR_DETAIL_LENGTH - 3)}...`;
			}
			throw new Error(`Ollama Cloud request failed: ${path} (${response.status})${detail ? `: ${detail}` : ""}`);
		}
		return response.json();
	}

	private async listModelIds(signal: AbortSignal): Promise<string[]> {
		return parseModelIds(await this.request("/api/tags", { method: "GET" }, signal));
	}

	private async showModel(id: string, signal: AbortSignal): Promise<OllamaCloudModelDetails> {
		return parseModelDetails(
			await this.request(
				"/api/show",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ model: id }),
				},
				signal,
			),
		);
	}

	async discoverModels(signal: AbortSignal): Promise<readonly OllamaCloudModelInspection[]> {
		const ids = await this.listModelIds(signal);
		const inspections: Array<OllamaCloudModelInspection | undefined> = new Array(ids.length);
		let cursor = 0;
		const workers = Array.from({ length: Math.min(this.concurrency, ids.length) }, async () => {
			while (cursor < ids.length) {
				const index = cursor++;
				const id = ids[index];
				if (id === undefined) continue;
				signal.throwIfAborted();
				try {
					inspections[index] = { id, ok: true, details: await this.showModel(id, signal) };
				} catch (error) {
					if (signal.aborted) signal.throwIfAborted();
					inspections[index] = { id, ok: false, error: asError(error) };
				}
			}
		});
		await Promise.all(workers);
		return inspections.filter((inspection): inspection is OllamaCloudModelInspection => inspection !== undefined);
	}
}
