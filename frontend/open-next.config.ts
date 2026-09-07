import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config: this app has no ISR / data-cache / "use cache", so no incremental
// cache override is needed. Add one (e.g. r2IncrementalCache) only if that changes.
export default defineCloudflareConfig({});
