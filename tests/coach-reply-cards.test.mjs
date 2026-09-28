import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("coach-reply builds cards from the RPC context and returns the complete contract", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  assert.match(source, /buildCoachCards\(\{ message, context: contextResult\.data \|\| \{\} \}\)/);
  assert.match(source, /answer,\s*cards,\s*context_version:/s);
  assert.equal((source.match(/api\.openai\.com\/v1\/responses/g) || []).length, 1);
});
