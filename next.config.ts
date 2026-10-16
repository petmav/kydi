import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // pdfkit loads its standard fonts through a package imports map that file tracing cannot follow.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfkit/js/standard-fonts/**/*", "./node_modules/pdfkit/package.json"],
  },
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer", "nodemailer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
