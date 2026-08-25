---
change_id: passwordless-magic-link-auth
title: Passwordless magic-link and code sign-in
status: implementing
created: 2026-08-25
updated: 2026-08-25
archived_at: null
---

## Notes

Roadmap Foundation F-02. Replaces password-based sign-up/sign-in with a
unified passwordless flow: email -> magic link (primary) or 6-digit code
(fallback) -> session. Password code paths are removed entirely, not kept
dormant. Parallel with F-01 (fairy-data-foundation); both unlock S-01.
