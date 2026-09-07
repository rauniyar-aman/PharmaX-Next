import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only local /public logos use next/image; media is served via plain <img>. Skipping the
  // optimizer avoids needing a Cloudflare Images binding and keeps the Worker deploy simple.
  images: { unoptimized: true },
};

export default nextConfig;

// Enables access to the Cloudflare context/bindings during `next dev`. No-op in production.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
