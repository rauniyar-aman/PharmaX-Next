import type { NextConfig } from "next";

// Hosts that may serve <Image>/media URLs. Derived from env so the same config works
// locally and in production without edits.
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [
  { protocol: "http", hostname: "localhost" },
  { protocol: "http", hostname: "127.0.0.1" },
];

for (const raw of [
  process.env.NEXT_PUBLIC_BACKEND_URL,
  process.env.NEXT_PUBLIC_MEDIA_URL,
]) {
  if (!raw) continue;
  try {
    const u = new URL(raw);
    remotePatterns.push({
      protocol: u.protocol.replace(":", "") as "http" | "https",
      hostname: u.hostname,
    });
  } catch {
    // ignore malformed env values
  }
}

const nextConfig: NextConfig = {
  images: { remotePatterns },
};

export default nextConfig;
