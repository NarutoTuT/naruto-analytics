import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "naruto-tests-"));
try {
  for (const suite of ["core", "email-flows"]) {
    await build({
      entryPoints: [`tests/${suite}.test.ts`],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: join(dir, `${suite}.mjs`),
      plugins: [
        {
          name: "isolate-services",
          setup(b) {
            if (suite === "email-flows") {
              for (const [suffix, exports] of Object.entries({
                "billing.server": ["requireSubscription", "getSubscription"],
                "analytics.server": ["fetchAndComputeAnalytics"],
                "email.server": ["sendDailyBrief"],
                "shopify.server": ["unauthenticated"],
              })) {
                b.onResolve(
                  { filter: new RegExp(suffix.replaceAll(".", "\\.") + "$") },
                  () => ({ path: suffix, namespace: "flows" }),
                );
                b.onLoad(
                  {
                    filter: new RegExp(
                      "^" + suffix.replaceAll(".", "\\.") + "$",
                    ),
                    namespace: "flows",
                  },
                  () => ({
                    contents: exports
                      .map((name) =>
                        name === "unauthenticated"
                          ? "export const unauthenticated = {admin: (...args) => globalThis.flow.admin(...args)};"
                          : `export const ${name} = (...args) => globalThis.flow.${name}(...args);`,
                      )
                      .join("\n"),
                    loader: "js",
                  }),
                );
              }
            }
            b.onResolve({ filter: /db\.server$/ }, () => ({
              path: "db",
              namespace: "test",
            }));
            b.onResolve({ filter: /shopify\.server$/ }, () => ({
              path: "shopify",
              namespace: "test",
            }));
            b.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
              contents:
                args.path === "db"
                  ? suite === "email-flows"
                    ? "export default new Proxy({}, {get: (_, key) => globalThis.flow.db[key]});"
                    : "export default {};"
                  : 'export const authenticate = {admin(){throw new Error("Real authentication is unavailable in unit tests")}};',
              loader: "js",
            }));
          },
        },
      ],
    });
    const result = spawnSync(
      process.execPath,
      ["--test", join(dir, `${suite}.mjs`)],
      { stdio: "inherit" },
    );
    if (result.status) process.exitCode = result.status;
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
