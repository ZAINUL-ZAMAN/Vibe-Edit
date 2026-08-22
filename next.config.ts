import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Codespaces serves the app through a forwarded *.app.github.dev
      // URL while Next.js thinks it's on localhost -- without this,
      // Server Actions (used by "Start a New Project" and Settings)
      // get blocked as a security precaution. Safe to keep long-term;
      // it just tells Next.js which origins are allowed to submit forms.
      allowedOrigins: ["localhost:3000", "*.app.github.dev"],
    },
  },
};

export default nextConfig;