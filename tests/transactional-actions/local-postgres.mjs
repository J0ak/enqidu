import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { prepareEnqiduAction, executePreparedEnqiduAction } from "../../src/enqiduTools/actions.js";

// Refuse remote URLs and inherited libpq connection overrides. This suite writes
// disposable users only in the explicitly opted-in local Supabase database.
if (process.env.ENQIDU_TRANSACTION_ENV_FILE) loadEnvFile(process.env.ENQIDU_TRANSACTION_ENV_FILE);
assert.equal(process.env.ENQIDU_TRANSACTION_LOCAL, "1", "Set ENQIDU_TRANSACTION_LOCAL=1 for disposable local PostgreSQL only");
const url = new URL(process.env.ENQIDU_TRANSACTION_DATABASE_URL || process.env.DB_URL || "invalid:");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol), "A local PostgreSQL URL is required");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Transactional tests refuse non-loopback database hosts");
assert.equal(url.search, "", "Connection URL options are forbidden");
assert.equal(url.pathname, "/postgres", "Use the disposable Supabase postgres database");
assert.ok(url.port, "An explicit local Supabase database port is required");
pg.types.setTypeParser(1082, (value) => value);
// Preserve PostgreSQL microseconds while matching PostgREST's ISO timestamp
// shape; Date.toISOString() would truncate revisions to milliseconds.
pg.types.setTypeParser(1184, (value) => value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
// PostgREST serializes numeric columns as JSON numbers. Match that transport
// representation for the real SQL adapter (pg otherwise returns numeric text).
pg.types.setTypeParser(1700, (value) => Number(value));

// The domain's trusted request clock is fixed at Monday so the complete
// remaining-week batch remains testable on every CI weekday. PostgreSQL and its
// locks are real; no database function, wall clock or command DTO is modified.
export const NOW = "2026-10-05T10:00:00.000Z";
export const DAY = "2026-10-05";
export const CALENDAR = { date: DAY, timezone: "Europe/Madrid" };
export const day = (offset) => new Date(Date.parse(`${DAY}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
export const WRAPPER = "public.apply_enqidu_action_v1(uuid,text,jsonb,jsonb)";

export async function connect(label = "monitor") {
  const client = new pg.Client({
    host: url.hostname.replace(/^\[|\]$/g, ""), port: Number(url.port), database: "postgres",
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    ssl: false, application_name: `enqidu-atomic-local-${label}`, connectionTimeoutMillis: 5000,
    statement_timeout: 15000, idle_in_transaction_session_timeout: 30000,
  });
  await client.connect();
  return client;
}

const identifier = (value) => {
  assert.match(value, /^[a-z_][a-z_0-9]*$/);
  return `"${value}"`;
};
function expression(value) {
  const match = value.match(/^([a-z_][a-z_0-9]*)(->>?)([a-z_][a-z_0-9]*)$/);
  return match ? `${identifier(match[1])}${match[2]}'${match[3]}'` : identifier(value);
}

/** A SQL transport adapter, not an in-memory database: every read and RPC hits
 * the real local PostgreSQL connection under the selected Supabase role. */
export function database(client) {
  return {
    auth: { async getUser() {
      const { rows } = await client.query("select auth.uid() as id");
      return { data: { user: rows[0].id ? { id: rows[0].id } : null }, error: null };
    } },
    from(table) {
      const predicates = [], values = [], ordering = [];
      let columns = "*", limit = 2000, offset = 0, count = false, head = false;
      const filter = (key, operator, value) => {
        values.push(value);
        predicates.push(`${expression(key)} ${operator} $${values.length}`);
        return query;
      };
      const query = {
        select(selected, options = {}) {
          columns = selected.split(",").map((item) => {
            const [alias, source] = item.split(":");
            return source ? `${expression(source)} as ${identifier(alias)}` : expression(alias);
          }).join(",");
          count = options.count === "exact"; head = options.head === true;
          return query;
        },
        eq: (key, value) => filter(key, "=", value),
        neq: (key, value) => filter(key, "<>", value),
        gte: (key, value) => filter(key, ">=", value),
        lte: (key, value) => filter(key, "<=", value),
        lt: (key, value) => filter(key, "<", value),
        in(key, members) {
          const slots = members.map((value) => { values.push(value); return `$${values.length}`; });
          predicates.push(slots.length ? `${expression(key)} in (${slots.join(",")})` : "false");
          return query;
        },
        order(key, { ascending = true } = {}) { ordering.push(`${expression(key)} ${ascending ? "asc" : "desc"}`); return query; },
        limit(value) { limit = value; return query; },
        range(first, last) { offset = first; limit = last - first + 1; return query; },
        then(resolve, reject) {
          const sql = `select ${columns}${count ? ",count(*) over() as __count" : ""} from public.${identifier(table)} ${predicates.length ? `where ${predicates.join(" and ")}` : ""} ${ordering.length ? `order by ${ordering.join(",")}` : ""} limit ${Number(limit)} offset ${Number(offset)}`;
          return client.query(sql, values).then((result) => ({ data: head ? null : result.rows, error: null,
            ...(count ? { count: Number(result.rows[0]?.__count || 0) } : {}) }), (error) => ({ data: null, error })).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      assert.ok(["get_ai_coach_context", "apply_enqidu_action_v1"].includes(name), "Only the canonical context and atomic writer are permitted");
      const entries = Object.entries(args);
      const result = await client.query(`select public.${identifier(name)}(${entries.map(([key], index) => `${identifier(key)} => $${index + 1}`).join(",")}) as result`,
        entries.map(([, value]) => value && typeof value === "object" ? JSON.stringify(value) : value));
      return { data: result.rows[0].result, error: null };
    },
  };
}

export async function role(client, name, userId = null) {
  assert.ok(["service_role", "authenticated", "anon"].includes(name));
  await client.query(`set role ${identifier(name)}`);
  await client.query("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false),set_config('request.jwt.claims',$3,false)",
    [name, userId || "", JSON.stringify({ role: name, ...(userId ? { sub: userId } : {}) })]);
}

export async function fixture(t) {
  const monitor = await connect("monitor"), a = await connect("writer-a"), b = await connect("writer-b"), reader = await connect("preview");
  const userId = randomUUID(), otherId = randomUUID();
  const fixture = { monitor, a, b, reader, userId, otherId, catalogIds: [] };
  t.after(async () => {
    await Promise.allSettled([a.query("rollback"), b.query("rollback")]);
    await Promise.allSettled([a.end(), b.end(), reader.end()]);
    try {
      // The canonical foundation guard also rejects raw-evidence deletion by
      // postgres/Auth cascades. Use the existing service role to remove only
      // these disposable users' evidence before cascading their Auth records.
      await role(monitor, "service_role");
      await monitor.query("delete from public.wearable_provider_raw_payloads where user_id=any($1::uuid[])", [[userId, otherId]]);
      await monitor.query("reset role");
      await monitor.query("delete from auth.users where id = any($1::uuid[])", [[userId, otherId]]);
      if (fixture.catalogIds.length) await monitor.query("delete from public.equipment_catalog where id=any($1::uuid[])", [fixture.catalogIds]);
    } finally { await monitor.end(); }
  });
  await monitor.query("insert into auth.users(id) values ($1),($2)", [userId, otherId]);
  await monitor.query("insert into public.profiles(id,timezone,display_name) values ($1,$3,'Local atomic athlete'),($2,$3,'Other local athlete') on conflict(id) do update set timezone=excluded.timezone", [userId, otherId, CALENDAR.timezone]);
  await monitor.query("insert into public.user_goals(user_id,name,status) values ($1,'Improve strength','active')", [userId]);
  await monitor.query("insert into public.user_training_locations(user_id,display_name,location_type,access_mode,prescription_scope,is_active) values ($1,'Home','home','own','autonomous',true)", [userId]);
  await Promise.all([role(a, "service_role"), role(b, "service_role"), role(reader, "authenticated", userId)]);
  fixture.source = await insertPlan(monitor, userId, DAY);
  fixture.foreign = await insertPlan(monitor, otherId, DAY);
  fixture.executionId = randomUUID();
  await monitor.query("insert into public.training_sessions(id,user_id,local_date,title,session_status,sport,duration_seconds) values ($1,$2,$3,'Preserved completed history','completed','strength',3000)", [fixture.executionId, userId, day(-1)]);
  await monitor.query("insert into public.fit_message_payloads(user_id,session_id,message_type,message_index,payload) values($1,$2,'session',0,'{\"fixture\":\"immutable local FIT evidence\"}')", [userId, fixture.executionId]);
  return fixture;
}

export async function insertPlan(client, userId, day, { id = randomUUID(), title = "Local strength plan" } = {}) {
  const blockId = randomUUID();
  await client.query(`insert into public.planned_training_sessions(id,user_id,planned_date,title,session_type,status,location_type,planned_duration_min,planned_duration_max,source)
    values($1,$2,$3,$4,'strength','planned','outdoor',50,50,'enkidu_coach')`, [id, userId, day, title]);
  await client.query(`insert into public.planned_session_blocks(id,planned_session_id,block_order,block_type,title,planned_duration_seconds,planned_exercises,constraints,notes)
    values($1,$2,1,'strength','Main strength block',3000,'[{"name":"Squat","target_sets":3}]','["No impact"]','Original block')`, [blockId, id]);
  return { id, blockId, day };
}

export async function preview(f, action, args = {}) {
  const prepared = await prepareEnqiduAction({ db: database(f.reader), userId: f.userId, calendar: CALENDAR, action, args, now: NOW });
  assert.equal(prepared.ok, true, `Real preview rejected: ${prepared.error}`);
  assert.ok(prepared.transaction, "Preview must contain the server-owned atomic transaction");
  return prepared;
}

export const apply = (client, userId, prepared) => executePreparedEnqiduAction({ adminDb: database(client), userId, prepared });

export async function rawApply(client, userId, transaction) {
  return (await client.query("select public.apply_enqidu_action_v1($1,$2,$3::jsonb,$4::jsonb) as result", [
    userId, transaction.action, JSON.stringify(transaction.expected), JSON.stringify(transaction.command),
  ])).rows[0].result;
}

/** Full persisted records plus xmin catch even same-value UPDATEs. */
export async function persisted(client, users) {
  const { rows } = await client.query(`select jsonb_build_object(
    'profiles',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(p),'xmin',p.xmin::text) order by p.id) from public.profiles p where id=any($1::uuid[])),'[]'),
    'plans',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(p),'xmin',p.xmin::text) order by p.id) from public.planned_training_sessions p where user_id=any($1::uuid[])),'[]'),
    'blocks',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(b),'xmin',b.xmin::text) order by b.id) from public.planned_session_blocks b join public.planned_training_sessions p on p.id=b.planned_session_id where p.user_id=any($1::uuid[])),'[]'),
    'availability',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) order by a.user_id,a.calendar_date) from public.training_availability_overrides a where user_id=any($1::uuid[])),'[]'),
    'constraints',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(c),'xmin',c.xmin::text) order by c.id) from public.coach_athlete_constraints c where user_id=any($1::uuid[])),'[]'),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(l),'xmin',l.xmin::text) order by l.id) from public.user_training_locations l where user_id=any($1::uuid[])),'[]'),
    'equipment',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(e),'xmin',e.xmin::text) order by e.id) from public.user_equipment e where user_id=any($1::uuid[])),'[]'),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(c),'xmin',c.xmin::text) order by c.id) from public.equipment_catalog c where c.id in (select equipment_id from public.user_equipment where user_id=any($1::uuid[]))),'[]'),
    'history',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(h),'xmin',h.xmin::text) order by h.id) from public.training_sessions h where user_id=any($1::uuid[])),'[]'),
    'fit',coalesce((select jsonb_agg(jsonb_build_object('row',to_jsonb(f),'xmin',f.xmin::text) order by f.id) from public.fit_message_payloads f where user_id=any($1::uuid[])),'[]')
    ) as state`, [users]);
  return rows[0].state;
}

/** Explicit PostgreSQL lock barrier. No sleep determines ordering: release A
 * only after PostgreSQL reports B blocked on A and exposes B's waiting lock. */
export async function assertBlocked(monitor, a, b, settled) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows: [state] } = await monitor.query(`select
      $1::integer=any(pg_blocking_pids($2)) as blocked_by_a,
      exists(select from pg_stat_activity where pid=$2 and wait_event_type='Lock') as waiting,
      exists(select from pg_locks where pid=$1 and granted and locktype in ('advisory','relation','transactionid','tuple')) as a_holds_lock,
      exists(select from pg_locks where pid=$2 and not granted) as b_has_waiting_lock`, [a.processID, b.processID]);
    if (state.blocked_by_a && state.waiting && state.a_holds_lock && state.b_has_waiting_lock) {
      assert.equal(settled(), false, "B must remain pending until A commits");
      return;
    }
    assert.equal(settled(), false, "B completed without waiting on A");
    await new Promise(setImmediate);
  }
  assert.fail("PostgreSQL did not establish the expected A -> B lock dependency");
}

export async function race(t, f, prepared, mutateA, verify) {
  await f.a.query("begin");
  await mutateA(f.a);
  const afterA = await persisted(f.a, [f.userId, f.otherId]);
  await f.b.query("begin");
  let settled = false;
  const waiting = apply(f.b, f.userId, prepared).then((result) => { settled = true; return result; }, (error) => { settled = true; throw error; });
  // Attach a handler immediately so an unexpected DB error cannot become an
  // unhandled rejection while the monitor establishes the barrier.
  waiting.catch(() => {});
  try {
    await assertBlocked(f.monitor, f.a, f.b, () => settled);
    t.diagnostic("A holds a real PostgreSQL lock; B is blocked by A with an ungranted lock; committing A releases B");
    await f.a.query("commit");
    const result = await waiting;
    assert.deepEqual(result, { ok: false, error: "preview_stale" });
    await f.b.query("commit");
    assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), afterA, "Stale B must perform zero persisted writes, including child rows");
    await verify?.(afterA);
  } finally {
    await f.a.query("rollback");
    if (!settled) await waiting.catch(() => {});
    await f.b.query("rollback");
  }
}
