import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { providerFactories } from "./providers/index.ts";

export default function registerOtherProviders(pi: ExtensionAPI): void {
	for (const createProvider of providerFactories) {
		pi.registerProvider(createProvider());
	}
}
