import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "naruto-test-store-"));
try {
  await build({
    entryPoints: ["tests/test-store.test.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: join(dir, "suite.mjs"),
    packages: "external",
    plugins: [
      {
        name: "isolated-services",
        setup(b) {
          b.onResolve({ filter: /db\.server$/ }, () => ({
            path: "db",
            namespace: "isolated",
          }));
          b.onLoad({ filter: /db/, namespace: "isolated" }, () => ({
            contents:
              "export default new Proxy({}, {get:(_,key)=>globalThis.scope.db[key]});",
            loader: "js",
          }));
          b.onResolve({ filter: /shopify\.server$/ }, () => ({
            path: "sdk",
            namespace: "isolated",
          }));
          b.onLoad({ filter: /sdk/, namespace: "isolated" }, () => ({
            contents:
              "export const authenticate={admin:(r)=>globalThis.scope.guarded.authenticate.admin(r),webhook:(r)=>globalThis.scope.sdk.authenticate.webhook(r)}; export const unauthenticated={admin:(s)=>globalThis.scope.guarded.unauthenticated.admin(s)};",
            loader: "js",
          }));
        },
      },
    ],
  });
  // Bundled test lives beside node_modules for external runtime packages; no service credentials loaded.
  const local = join(
    process.cwd(),
    "node_modules/.cache/naruto-test-store.mjs",
  );
  const { mkdir, copyFile } = await import("node:fs/promises");
  await mkdir(join(process.cwd(), "node_modules/.cache"), { recursive: true });
  await copyFile(join(dir, "suite.mjs"), local);
  try {
    const p = spawnSync(process.execPath, ["--test", local], {
      stdio: "inherit",
    });
    process.exitCode = p.status ?? 1;
  } finally {
    await rm(local, { force: true });
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
