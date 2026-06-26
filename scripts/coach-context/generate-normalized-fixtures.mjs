import { writeNormalizedCoachContext } from "../../src/coachContext/index.js";

const result = await writeNormalizedCoachContext({ rootDir: process.cwd() });
const changed = result.writeResults.filter((entry) => entry.changed).length;

console.log(`Generated normalized coach context fixtures for ${result.manifest.fixture_user}.`);
console.log(`Normalized sessions: ${result.manifest.counts.normalized_sessions}`);
console.log(`Generated files: ${result.manifest.generated_files.length}`);
console.log(`Changed files: ${changed}`);

