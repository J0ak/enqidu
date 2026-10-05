import { cp, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const original = new URL("../supabase/functions/", import.meta.url);
const target = new URL("./supabase/functions/", import.meta.url);
await mkdir(target, { recursive: true });
await cp(original, target, { recursive: true });
await cp(new URL("../src/", import.meta.url), new URL("./src/", import.meta.url), { recursive: true });

// Hosted Edge builds also bundle their graph. Use the repo's locked SDK for the
// local graph so the runtime needs no registry requests or remote API keys.
const localDependencies = {
  name: "local-edge-dependencies",
  setup(builder) {
    builder.onResolve({ filter: /^jsr:@supabase\/functions-js\/edge-runtime\.d\.ts$/ }, (args) => ({ path: args.path, namespace: "edge-declarations" }));
    builder.onLoad({ filter: /.*/, namespace: "edge-declarations" }, () => ({ contents: "", loader: "js" }));
    builder.onResolve({ filter: /^npm:@supabase\/supabase-js@2$/ }, () => ({ path: require.resolve("@supabase/supabase-js") }));
  },
};

const functions = (await readdir(original, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"));
for (const entry of functions) {
  await build({
    entryPoints: [fileURLToPath(new URL(`${entry.name}/index.ts`, original))],
    outfile: fileURLToPath(new URL(`${entry.name}/index.ts`, target)),
    bundle: true, format: "esm", platform: "browser", target: "es2022",
    plugins: [localDependencies], logLevel: "error",
  });
}
console.log(`Prepared ${functions.length} unchanged Edge Functions with local locked dependencies (OpenAI remains disabled).`);
