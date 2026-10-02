# Canonical athlete calendar timezone

## Problem

ENQIDU previously derived the default Coach date from the browser's local calendar.

That is unsafe for a cloud browser, a traveler or any device running in a timezone different from the athlete's home calendar. During Work QA, the remote browser was still on 2026-10-01 in PDT while the athlete in Madrid was already on 2026-10-02.

## Rule

Relative concepts such as:

- today;
- yesterday;
- current week;
- today's recommendation;

use the timezone stored on the athlete profile.

For the current athlete this is `Europe/Madrid`.

The browser timezone is only a fallback for profiles that do not yet have a canonical timezone.

Explicit historical dates remain possible when the caller marks the date as explicit.

## Server ownership

`coach-reply` resolves the canonical request date after authenticating the user and loading `profiles.timezone`.

The frontend no longer sends its local calendar date as the default source of truth.

The response exposes the resolved request date/timezone for technical QA.

## Coach action rollover

`coach-plan-action` independently resolves today's canonical profile date.

A recommendation card from a previous canonical day is rejected with:

`stale_recommendation_date`

and no plan is written.

This prevents a card left open across midnight or opened in a different browser timezone from silently writing to the wrong day.

## Database timestamps

Supabase/Postgres remains in UTC. The profile timezone defines only the athlete's civil-calendar interpretation. Database timezone is not changed.
