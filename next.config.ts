import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Kydi does not use next/image; the optional sharp/libvips binaries are removed from the container image.
  images: { unoptimized: true },
  // pdfkit loads its standard fonts through a package imports map that file tracing cannot follow.
  outputFileTracingIncludes: {
    // The bundled DejaVu Sans PDF font (src/pdf/fonts.ts) is read from disk at runtime.
    "/**": ["./node_modules/pdfkit/js/standard-fonts/**/*", "./node_modules/pdfkit/package.json", "./assets/fonts/**/*"],
  },
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer", "nodemailer"],
  // Static subset for every response, including /_next/static assets that bypass the middleware.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Receipts may be up to 20 MB (spec §10.2) plus form overhead.
      bodySizeLimit: "21mb",
    },
  },
};

export default nextConfig;
