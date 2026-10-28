import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// The reviewed private OAuth migration, unchanged, on an in-process PostgreSQL.
// Only the Supabase objects it references are stubbed. Every store call runs as
// the least-privilege runtime role, so the function ACLs are exercised too.
export const OAUTH_MIGRATION = readFileSync(
  new URL(
    "../../supabase/migrations/20261023150630_mcp_private_oauth_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
export async function oauthSql() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users(id uuid primary key, deleted_at timestamptz, banned_until timestamptz, is_anonymous boolean default false);
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create schema training_semantics;
    create function training_semantics.state(uuid, uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
  `);
  await db.exec(OAUTH_MIGRATION);
  let queue = Promise.resolve();
  const store = {
    calls: [],
    call(operation, input) {
      store.calls.push(operation);
      // PGlite has one session: serialize role switches around each operation.
      const run = queue.then(async () => {
        await db.exec("set role enqidu_mcp_oauth");
        try {
          return (
            await db.query(
              `select mcp_private.${operation}($1::jsonb) as result`,
              [JSON.stringify(input)],
            )
          ).rows[0].result;
        } finally {
          await db.exec("reset role");
        }
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return { db, store };
}
