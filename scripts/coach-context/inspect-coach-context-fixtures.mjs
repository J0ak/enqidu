import { buildCoachContextFixture, writeNormalizedCoachContext } from "../../src/coachContext/index.js";

const context = await buildCoachContextFixture({ rootDir: process.cwd() });
const normalized = await writeNormalizedCoachContext({ rootDir: process.cwd() });

console.log(`References: ${Object.values(context.references).filter(Boolean).length}`);
console.log(`Raw sessions: ${context.sessionFixtures.length}`);
console.log(`Normalized sessions: ${normalized.normalizedSessions.length}`);
console.log(`Warnings: ${normalized.manifest.counts.warnings}`);

const missingFields = normalized.normalizedSessions.flatMap((session) =>
  (session.data_quality.missing_fields ?? []).map((field) => `${session.source_traceability.file}:${field}`),
);
console.log(`Missing fields: ${missingFields.length ? missingFields.join(", ") : "none"}`);

for (const session of normalized.normalizedSessions) {
  const summary = session.session.title ?? session.session.session_type ?? "untitled";
  console.log(`- ${session.source_traceability.file}: ${session.session.date ?? "unknown_date"} | ${summary}`);
}

