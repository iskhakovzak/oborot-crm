import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "pdf-lib", "nodemailer", "@pdf-lib/fontkit"],
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**", "./data/pg/**", "./src/assets/fonts/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
