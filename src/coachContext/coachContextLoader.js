import { COACH_CONTEXT_STATUS, emptyCoachContextDto } from "./coachContextTypes.js";
import { createCoachContextRepository } from "./coachContextRepository.js";

export async function loadCoachContext(db, options = {}) {
  try {
    return await createCoachContextRepository(db).load(options);
  } catch (error) {
    return {
      ...emptyCoachContextDto({
        type: options.fixtureUser ? "fixture" : options.userId ? "user" : "empty",
        user_id: options.userId ?? null,
        fixture_user: options.fixtureUser ?? null,
      }),
      status: COACH_CONTEXT_STATUS.error,
      error: String(error?.message ?? error),
      data_quality: {
        warnings: ["coach_context_load_failed"],
      },
    };
  }
}
