import type { Provider } from "@earendil-works/pi-ai";
import { createOllamaCloudProvider } from "./ollama-cloud/provider.ts";

export type ProviderFactory = () => Provider;

export const providerFactories: readonly ProviderFactory[] = [createOllamaCloudProvider];
