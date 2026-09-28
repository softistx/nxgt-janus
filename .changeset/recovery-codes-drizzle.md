---
'@nxgt/janus-drizzle': minor
---

Recovery codes on a second factor, for `@nxgt/janus` 0.10. `users` gains `second_factor_recovery_codes`, a nullable `text[]` holding the codes' keyed hashes in order. No codes are written `null`, never `{}`, and `null` reads as `[]`, so a row written before the column existed reads as a factor with no codes. The `users_second_factor_whole` check now keeps the codes to a row with a second factor.

**A migration is required.** Generate and apply it before deploying, as for 0.2:

```sh
bunx drizzle-kit generate --config drizzle.janus.config.ts
bunx drizzle-kit migrate --config drizzle.janus.config.ts
```

drizzle-kit writes two statements — the column, and the check dropped and added again — and rewrites no row:

```sql
ALTER TABLE "users" ADD COLUMN "second_factor_recovery_codes" text[];
ALTER TABLE "users" DROP CONSTRAINT "users_second_factor_whole", ADD CONSTRAINT "users_second_factor_whole" CHECK (("second_factor_method" is null) = ("second_factor_secret" is null) and ("second_factor_method" is not null or ("second_factor_confirmed_at" is null and "second_factor_last_step" is null and "second_factor_recovery_codes" is null)));
```

Deployed before it, every query on `users` fails with `STORE_FAILED`, caused by `column "second_factor_recovery_codes" does not exist`.

**Finish the rollout before users hold codes.** An instance still on 0.3 knows four columns: once a user holds recovery codes, its `secondFactor.disable` leaves them beside a factor removed, the check refuses the write, and the call fails with `STORE_FAILED` (it succeeds on 0.4; nothing is lost). Run the two side by side only while no user has been given codes.
