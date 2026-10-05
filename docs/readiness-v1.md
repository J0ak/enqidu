# Readiness V1

`readiness_v1` is derived ENQIDU domain output, not Garmin evidence. Algorithm `enqidu.readiness.v1.0.0` is deterministic and returns a score only from current evidence.

The initial robust factors are observed sleep score, observed morning/current Body Battery, HRV relative to the athlete's rolling median, and resting heart rate relative to the athlete's rolling median. Personal baselines use up to 28 valid prior observations and require at least seven; no population threshold such as “HRV above 50” is used. HRV and resting-heart-rate factors are omitted when their baseline is insufficient. Absolute vendor scales contribute symmetrically around their documented scale midpoint, capped through the final 0–100 score.

No usable factor produces `status=unavailable` and `score=null`, never 0 or 50 as a placeholder. One or two factors produce `partial`; three or more produce `available`. Each factor carries observed value, optional baseline, numeric contribution and reason. The result also includes algorithm/schema versions, evidence dates, generation timestamp, confidence and relevant missing inputs, making a past result reproducible when inputs are retained.

Readiness is contextual information, not a diagnosis. A persisted plan remains authoritative; readiness cannot move, cancel or overwrite it.

