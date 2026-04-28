import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    // Solana web3 + wallet adapter expect Node-style Buffer / process / crypto.
    nodePolyfills({
      include: ["buffer", "process", "crypto", "stream", "util", "events"],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  define: {
    // Required by some Solana / web3 libs that expect Node-style globals.
    global: "globalThis",
    "process.env": {},
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      // mpl-core / mpl-bubblegum require bare `@noble/hashes/sha3` etc, but
      // those bare specifiers fail when the importer's resolved @noble/hashes
      // is v2.x (only `.js` subpaths exported). Re-route bare subpaths to
      // absolute file paths so the package `exports` map is bypassed.
      // _assert → v1.5.0 (has `assert.bool` default export needed by
      // ethereum-cryptography). Everything else → v1.8.0 (has the new
      // `ahash` / `anumber` exports required by @noble/curves@^1.9 while
      // keeping back-compat aliases for older v1.x callers).
      "@noble/hashes/_assert": path.resolve(
        import.meta.dirname,
        "../../node_modules/.pnpm/@noble+hashes@1.5.0/node_modules/@noble/hashes/_assert.js",
      ),
      ...Object.fromEntries(
        [
          "sha2",
          "sha3",
          "sha256",
          "sha512",
          "sha3-addons",
          "hmac",
          "utils",
          "crypto",
          "blake2b",
          "blake2s",
          "blake3",
          "ripemd160",
          "pbkdf2",
          "scrypt",
          "hkdf",
          "argon2",
          "eskdf",
        ].map((name) => [
          `@noble/hashes/${name}`,
          path.resolve(
            import.meta.dirname,
            "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes",
            `${name}.js`,
          ),
        ]),
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "buffer",
      "@solana/web3.js",
      "@solana/wallet-adapter-react",
      "@solana/wallet-adapter-react-ui",
      "@solana/wallet-adapter-wallets",
    ],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
