import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isDevBuild = process.env.KUDOKU_DEV_BUILD === "1";

const bbSymlink = resolve(__dirname, "node_modules", "@aztec", "bb.js");
const bbPkgDir = realpathSync(bbSymlink);
const bbNodeDir = resolve(bbPkgDir, "dest", "node");

/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir: isDevBuild ? ".next-dev" : ".next",
  experimental: {
    serverComponentsExternalPackages: [
      "@aztec/bb.js",
      "@noir-lang/noir_js",
      "@noir-lang/acvm_js",
      "@noir-lang/noirc_abi",
      "@noir-lang/types"
    ]
  },
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true
    };

    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        "@noir-lang/noir_js": "commonjs @noir-lang/noir_js",
        "@noir-lang/acvm_js": "commonjs @noir-lang/acvm_js",
        "@noir-lang/noirc_abi": "commonjs @noir-lang/noirc_abi",
        "@aztec/bb.js": "commonjs @aztec/bb.js"
      });
    }

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        os: false
      };

      config.resolve.alias = {
        ...config.resolve.alias,
        "@aztec/bb.js": resolve(bbNodeDir, "index.js"),
        [resolve(bbNodeDir, "barretenberg_wasm", "barretenberg_wasm_main", "factory", "node")]:
          resolve(bbNodeDir, "barretenberg_wasm", "barretenberg_wasm_main", "factory", "browser"),
        [resolve(bbNodeDir, "barretenberg_wasm", "barretenberg_wasm_thread", "factory", "node")]:
          resolve(bbNodeDir, "barretenberg_wasm", "barretenberg_wasm_thread", "factory", "browser"),
        [resolve(bbNodeDir, "barretenberg_wasm", "helpers", "node")]:
          resolve(bbNodeDir, "barretenberg_wasm", "helpers", "browser"),
        [resolve(bbNodeDir, "barretenberg_wasm", "fetch_code", "node")]:
          resolve(bbNodeDir, "barretenberg_wasm", "fetch_code", "browser"),
        [resolve(bbNodeDir, "crs", "node")]: resolve(bbNodeDir, "crs", "browser"),
        [resolve(bbNodeDir, "bb_backends", "node")]: resolve(bbNodeDir, "bb_backends", "browser"),
        [resolve(bbPkgDir, "dest", "node", "barretenberg_wasm", "barretenberg.wasm.gz")]:
          resolve(bbPkgDir, "dest", "node", "barretenberg_wasm", "barretenberg-threads.wasm.gz")
      };

        config.module.rules.push({
          test: /(factory|fetch_code)[\\/]browser[\\/]index\.js$/,
          include: /bb\.js/,
          enforce: "pre",
          use: [
            {
              loader: resolve(__dirname, "bb-worker-patch-loader.cjs")
            }
          ]
        });

        config.module.rules.push({
          test: /\.wasm\.gz$/,
          type: "asset/resource",
          generator: {
            filename: "static/wasm/[name].[hash][ext]"
          }
        });

        config.resolve.alias = {
          ...config.resolve.alias,
          "@farcaster/mini-app-solana": resolve(
            __dirname,
            "src",
            "lib",
            "privy",
            "farcaster-mini-app-solana-stub.ts"
          )
        };
      }

    config.module.rules.push({
      test: /\.node$/,
      use: "ignore-loader"
    });

    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp"
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
