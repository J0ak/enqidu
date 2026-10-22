import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { auditOAuthBoundary } from "./audit-oauth-boundary.mjs";
if (process.env.ENQIDU_TRANSACTION_ENV_FILE)
  loadEnvFile(process.env.ENQIDU_TRANSACTION_ENV_FILE);
assert.equal(process.env.ENQIDU_TRANSACTION_LOCAL, "1");
const url = new URL(process.env.DB_URL);
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    url.pathname === "/postgres" &&
    url.port &&
    !url.search,
);
const db = new pg.Client({ connectionString: url.href });
await db.connect();
try {
  const result = await auditOAuthBoundary(db);
  assert.deepEqual(result.errors, []);
  for (const ddl of [
    "create table public.future_unprotected(id int); alter table public.future_unprotected enable row level security; grant select on public.future_unprotected to authenticated;",
    "drop policy enqidu_oauth_no_direct_access on public.training_sessions;",
    "alter policy enqidu_oauth_no_direct_access on public.training_sessions using (not ((select auth.jwt()->>'client_id') is null));",
    "create table public.future_column_grant(id int); alter table public.future_column_grant enable row level security; grant select(id) on public.future_column_grant to authenticated;",
    "alter table public.training_sessions disable row level security;",
    `create function public.future_unsafe() returns int language sql security definer as $$ select 1 $$; grant execute on function public.future_unsafe() to authenticated;`,
  ]) {
    await db.query("begin");
    try {
      await db.query(ddl);
      assert.ok((await auditOAuthBoundary(db)).errors.length > 0);
    } finally {
      await db.query("rollback");
    }
  }
  // Direct PostgreSQL acceptance bypasses the HTTP guard: proves restrictive RLS itself.
  await db.query("begin");
  try {
    await db.query(
      "create table public.oauth_rls_probe(id int primary key,user_id uuid,value int); alter table public.oauth_rls_probe enable row level security; grant select,insert,update,delete on public.oauth_rls_probe to authenticated;",
    );
    await db.query(
      `create policy owner on public.oauth_rls_probe for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid()); create policy enqidu_oauth_no_direct_access on public.oauth_rls_probe as restrictive for all to authenticated using((select auth.jwt()->>'client_id') is null) with check((select auth.jwt()->>'client_id') is null);`,
    );
    const a = "00000000-0000-0000-0000-000000000001",
      b = "00000000-0000-0000-0000-000000000002";
    await db.query(
      "insert into public.oauth_rls_probe values(1,$1,10),(2,$2,20)",
      [a, b],
    );
    await db.query("set local role authenticated");
    const claims = async (extra) =>
      db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: a, role: "authenticated", ...extra }),
      ]);
    await claims({});
    assert.equal(
      (await db.query("select * from public.oauth_rls_probe")).rowCount,
      1,
    );
    assert.equal(
      (await db.query("update public.oauth_rls_probe set value=11")).rowCount,
      1,
    );
    await db.query("insert into public.oauth_rls_probe values(3,$1,30)", [a]);
    assert.equal(
      (await db.query("delete from public.oauth_rls_probe where id=3"))
        .rowCount,
      1,
    );
    await claims({ client_id: "local-oauth" });
    assert.equal(
      (await db.query("select * from public.oauth_rls_probe")).rowCount,
      0,
    );
    assert.equal(
      (await db.query("update public.oauth_rls_probe set value=99")).rowCount,
      0,
    );
    assert.equal(
      (await db.query("delete from public.oauth_rls_probe")).rowCount,
      0,
    );
    for (const query of [
      `insert into public.oauth_rls_probe values(4,'${a}',40)`,
      `select public.set_garmin_sync_consent('enable','garmin_daily_v1')`,
    ]) {
      await db.query("savepoint denied");
      await assert.rejects(db.query(query), (e) => e.code === "42501");
      await db.query("rollback to savepoint denied");
    }
  } finally {
    await db.query("rollback");
  }
  console.log(
    `OAuth PostgreSQL acceptance PASS: ${result.relations.length} exposed relations audited; future table/policy/RLS/RPC regressions detected; first-party CRUD preserved; OAuth CRUD/RPC denied.`,
  );
} finally {
  await db.end();
}
