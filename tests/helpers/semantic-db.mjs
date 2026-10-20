import { database, insert } from "./reconciliation-db.mjs";
import { readFileSync } from "node:fs";
export const semanticMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20261018143400_canonical_training_semantics_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
export async function semanticDatabase() {
  const db = await database();
  await db.exec(`create table public.exercise_catalog(id uuid primary key default gen_random_uuid(),code text not null unique,name text not null,is_active boolean not null default true,metadata jsonb not null default '{}');
 alter table session_exercises add foreign key(exercise_id) references exercise_catalog(id);
 alter table session_exercises add foreign key(session_id) references training_sessions(id);
 alter table training_sources add foreign key(user_id) references auth.users(id);
 alter table enkidu_conversation_enrichments add unique(session_id,enrichment_type,source);
 alter table session_exercises enable row level security;
 alter table session_blocks enable row level security;
 alter table training_sessions enable row level security;
 alter table training_sources enable row level security;
 alter table session_source_links enable row level security;
 alter table enkidu_conversation_enrichments enable row level security;
 create policy owner_session on training_sessions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create policy owner_source on training_sources for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 grant select,insert,update,delete on training_sessions,training_sources,session_exercises,session_blocks,session_source_links,enkidu_conversation_enrichments to authenticated;
 create policy owner_exercise on session_exercises for all to authenticated using(exists(select 1 from training_sessions s where s.id=session_id and s.user_id=auth.uid()));
 create policy owner_block on session_blocks for all to authenticated using(exists(select 1 from training_sessions s where s.id=session_id and s.user_id=auth.uid()));
 create policy owner_link on session_source_links for all to authenticated using(exists(select 1 from training_sessions s where s.id=session_id and s.user_id=auth.uid()));
 create policy owner_event on enkidu_conversation_enrichments for all to authenticated using(exists(select 1 from training_sessions s where s.id=session_id and s.user_id=auth.uid()));`);
  await db.exec(semanticMigration);
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261019190737_semantic_materialization_v1.sql",import.meta.url),"utf8"));
  return db;
}
export async function semanticFixture(db) {
  const user = crypto.randomUUID(),
    other = crypto.randomUUID(),
    session = crypto.randomUUID(),
    foreign = crypto.randomUUID(),
    source = crypto.randomUUID(),
    exercise = crypto.randomUUID();
  for (const id of [user, other]) {
    await insert(db, "auth.users", { id });
    await insert(db, "profiles", { id, timezone: "Europe/Madrid" });
  }
  await insert(db, "training_sources", {
    id: source,
    user_id: user,
    source_type: "garmin_fit",
    source_name: "Synthetic FIT",
    file_checksum: crypto.randomUUID(),
    original_json: { immutable: "FIT raw marker" },
  });
  await insert(db, "training_sessions", {
    id: session,
    user_id: user,
    source_id: source,
    title: "Fuerza",
    session_kind: "completed",
    local_date: "2026-10-18",
    duration_seconds: 3600,
    session_structure: { hr: 123, training_effect: 3 },
  });
  await insert(db, "training_sessions", {
    id: foreign,
    user_id: other,
    title: "Private Pilates",
    session_kind: "completed",
    local_date: "2026-10-18",
  });
  await insert(db, "session_source_links", {
    session_id: session,
    source_id: source,
    source_role: "garmin_fit",
    is_primary: true,
  });
  await insert(db, "session_exercises", {
    id: exercise,
    session_id: session,
    reported_name: "Press banca",
    sets_completed: 3,
    reps_per_set: [10, 10, 10],
    load_value: 40,
    load_unit: "kg",
    duration_seconds: 123,
    notes: "Preserved",
  });
  return { user, other, session, foreign, source, exercise };
}
export async function state(db, f) {
  return (
    await db.query("select training_semantics.state($1,$2) s", [
      f.user,
      f.session,
    ])
  ).rows[0].s;
}
export async function command(db, f, operations) {
  const current = await state(db, f);
  return {
    user: f.user,
    session: f.session,
    revision: current.revision,
    fingerprint: "sha256:" + crypto.randomUUID().replaceAll("-", "").repeat(2),
    expires: new Date(Date.now() + 240000).toISOString(),
    operations,
  };
}
export async function apply(db, c) {
  return (
    await db.query(
      "select public.apply_training_semantics_v1($1,$2,$3,$4,$5,$6,$7) r",
      [
        c.user,
        c.session,
        c.revision,
        c.fingerprint,
        c.expires,
        JSON.stringify(c.operations),
        "app",
      ],
    )
  ).rows[0].r;
}
