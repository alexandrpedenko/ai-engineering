# ADR-0008 — Per-user personalisation only, no cross-user logic

**Status:** Accepted (2026-09-06)

## Context

"People who liked X also liked Y" is the classic recommender algorithm. It needs
a population of users. This project has one developer using the app to test it —
the application may have many users one day, but the algorithms in it should not
assume a crowd.

## Decision

Personalisation reads one profile: the current user's own likes, dislikes and
reading list. No algorithm in this project reads across profiles.

`Profile` is keyed by a user id from the start, and events carry `user`. Adding
a second user is then a storage question, not a rewrite.

## Consequences

- Collaborative filtering, matrix factorisation and popularity priors are out of
  scope (this is the ADR that puts them there).
- Cold start is a real problem with no crowd to fall back on — book 4 has to
  handle an empty profile, and the answer is "behave exactly like plain search".
- Every number in the project describes one person's experience. That is honest
  for a system with one user and would not generalise.

## Alternatives considered

- **Global click-popularity ranking** (the Google-style signal: pages many
  people click rise for everyone). Real and useful, but it needs traffic, and
  with one user it degenerates into "rank by what I clicked", which the taste
  vector already does more directly.
