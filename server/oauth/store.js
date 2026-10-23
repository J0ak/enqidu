import pg from "pg";
const operations = new Set([
  "create_request_v1",
  "request_details_v1",
  "decide_request_v1",
  "consume_authorization_code_v1",
  "rotate_refresh_token_v1",
  "resolve_access_token_v1",
  "connections_v1",
  "revoke_grant_v1",
  "revoke_token_v1",
]);
// One short connection/query per operation; no named prepared statements, memory
// sessions, pool affinity, or JS read/check/write. Supavisor transaction mode.
export function createOAuthStore({ connectionString, local = false }) {
  return {
    async call(operation, input) {
      if (!operations.has(operation)) throw Error("operation_unavailable");
      const db = new pg.Client({
        connectionString,
        ssl: local ? false : { rejectUnauthorized: true },
        connectionTimeoutMillis: 4000,
        statement_timeout: 5000,
        query_timeout: 6000,
      });
      try {
        await db.connect();
        return (
          await db.query(
            `select mcp_private.${operation}($1::jsonb) as result`,
            [JSON.stringify(input)],
          )
        ).rows[0].result;
      } finally {
        await db.end();
      }
    },
  };
}
