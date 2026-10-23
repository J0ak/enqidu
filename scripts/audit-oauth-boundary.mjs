// Read-only catalog audit shared by acceptance and future CI. No production connection here.
export async function auditOAuthBoundary(db) {
  const errors = [];
  const { rows: relations } = await db.query(
    `select c.oid,c.relname,c.relkind,c.relrowsecurity,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f') and (has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) order by c.relname`,
  );
  for (const r of relations) {
    if (["r", "p"].includes(r.relkind)) {
      const {
        rows: [p],
      } = await db.query(
        `select polpermissive,polcmd,polroles::oid[] as roles, pg_get_expr(polqual,polrelid) as qual,pg_get_expr(polwithcheck,polrelid) as check, (select oid from pg_roles where rolname='authenticated') as authenticated from pg_policy where polrelid=$1 and polname='enqidu_oauth_no_direct_access'`,
        [r.oid],
      );
      // Require the exact canonical deny expression, not just a substring that
      // could also occur under NOT/OR or another permissive expression.
      const valid = (expression) =>
        expression?.replace(/\s+/g, "") ===
        "((SELECT(auth.jwt()->>'client_id'::text))ISNULL)";
      if (
        !r.relrowsecurity ||
        !p ||
        p.polpermissive ||
        p.polcmd !== "*" ||
        !p.roles.includes(p.authenticated) ||
        !valid(p.qual) ||
        !valid(p.check)
      )
        errors.push(`unprotected table: ${r.relname}`);
    } else if (
      r.relkind !== "v" ||
      !r.reloptions?.includes("security_invoker=true")
    )
      errors.push(`unsafe relation: ${r.relname}`);
  }
  const { rows: functions } = await db.query(
    `select p.oid::regprocedure::text as signature,p.prosecdef,p.provolatile,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prorettype<>'trigger'::regtype and has_function_privilege('authenticated',p.oid,'EXECUTE')`,
  );
  for (const f of functions)
    if (
      (f.prosecdef || f.provolatile === "v") &&
      !/perform public\.enqidu_assert_first_party\(\);/i.test(f.definition)
    )
      errors.push(`unguarded RPC: ${f.signature}`);
  const {
    rows: [hook],
  } = await db.query(
    `select exists(select 1 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole, lateral unnest(s.setconfig) setting where r.rolname='authenticator' and setting='pgrst.db_pre_request=public.enqidu_data_api_guard') as present`,
  );
  if (!hook.present) errors.push("Data API guard missing");
  const {
    rows: [adapter],
  } = await db.query(
    `select has_function_privilege('authenticated','public.read_training_semantics_for_mcp_v1(uuid,uuid)','EXECUTE') or has_function_privilege('anon','public.read_training_semantics_for_mcp_v1(uuid,uuid)','EXECUTE') as exposed`,
  );
  if (adapter.exposed) errors.push("service semantic adapter exposed");
  // V1 has no Storage surface. Any new bucket or client-facing policy needs an
  // explicit OAuth isolation review; do not infer safety from a private bucket flag.
  const {
    rows: [storage],
  } = await db.query(
    "select to_regclass('storage.buckets') is not null as present",
  );
  const bucketCount = storage.present
    ? Number(
        (await db.query("select count(*) as count from storage.buckets"))
          .rows[0].count,
      )
    : 0;
  const { rows: storagePolicies } = await db.query(
    "select policyname from pg_policies where schemaname='storage' and ('authenticated'=any(roles) or 'public'=any(roles))",
  );
  if (bucketCount)
    errors.push("Storage buckets require explicit OAuth isolation review");
  if (storagePolicies.length)
    errors.push(
      "Storage client policies require explicit OAuth isolation review",
    );
  return {
    errors,
    storage: {
      present: storage.present,
      buckets: bucketCount,
      clientPolicies: storagePolicies.length,
    },
    relations: relations.map((r) => r.relname),
    functions: functions.map((f) => f.signature),
  };
}
