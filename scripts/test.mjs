import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "naruto-tests-"));
try {
  for (const suite of (process.argv.slice(2).length ? process.argv.slice(2) : ["core", "email-flows", "agreement", "dpa-gate"])) {
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
            if (suite === "dpa-gate") {
              b.onResolve({filter:/\/dpa$/},()=>({path:"gate-config",namespace:"gate"}));
              b.onLoad({filter:/.*/,namespace:"gate"},()=>({contents:'export const DPA_VERSION="fixture-v1", DPA_SHA256="fixture-hash"; export let DPA_STATUS="published"; export function setStatus(value){DPA_STATUS=value}',loader:"js"}));
            }
            if (suite === "agreement") {
              b.onResolve({filter:/dpa\.server$/},()=>({path:"agreement-config",namespace:"agreement"}));
              b.onLoad({filter:/.*/,namespace:"agreement"},()=>({contents:"export const dpaEnabled=()=>globalThis.legal.enabled; export const dpaTestEnabled=()=>false;",loader:"js"}));
            }
            if (suite === "email-flows") {
              b.onResolve({filter:/job-health\.server$/},()=>({path:"job-health",namespace:"health"}));
              b.onLoad({filter:/.*/,namespace:"health"},()=>({contents:"export const recordJobSuccess=async()=>{};",loader:"js"}));
              for (const [suffix, exports] of Object.entries({
                "billing.server": ["requireSubscription", "getSubscription"],
                "dpa.server": ["hasDpaAcceptance"],
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
                  ? suite === "dpa-gate"
                    ? "export default {legalAcceptance:{findUnique:async(args)=>globalThis.gate.find(args)}};"
                    : suite === "agreement"
                    ? "export default {legalAcceptance:{upsert:async (args)=>globalThis.legal.writes.push(args)}};"
                    : suite === "email-flows"
                    ? "export default new Proxy({}, {get: (_, key) => globalThis.flow.db[key]});"
                    : 'export default {shop:{findUnique:async()=>({myshopifyDomain:"naruto-dev-ts8dqzla.myshopify.com"})}};'
                  : suite === "agreement"
                    ? 'export const authenticate = {admin:async()=>({session:{shop:"verified.myshopify.com"},sessionToken:{sub:globalThis.legal.actor},redirect:(url)=>new Response(null,{status:302,headers:{Location:url}})})};'
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
  if (!process.argv.slice(2).length) {
  const extra = spawnSync(process.execPath, ["--test", "tests/operations.test.mjs", "tests/dependency.test.mjs"], {stdio:"inherit"});
  if (extra.status) process.exitCode = extra.status;
  const scope = spawnSync(process.execPath, ["scripts/test-test-store.mjs"], {stdio:"inherit"});
  if (scope.status) process.exitCode = scope.status;
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
