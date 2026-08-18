# National planning lifecycle backfill resume

Do not resume until a read-only Supabase health check completes promptly and the
project endpoint no longer returns Cloudflare 522 responses.

The committed checkpoint resumes Fingal strictly after ArcGIS `OBJECTID 242861`.
Cork City and Dublin City are complete. Separate Kildare trial batches are not in
this checkpoint and will be encountered again safely because the updates and event
identities are idempotent.

Resume conservatively with:

```sh
npm run planning:national:lifecycle:backfill -- --batch-size 250 --resume-file docs/planning-lifecycle-backfill-checkpoint.json
```

If Fingal or another authority times out again, stop the client and allow the
project database to recover instead of repeatedly probing it. The backfill retries
transient failures and adaptively splits failed batches larger than 250 rows. The
checkpoint advances only after a successful committed batch, so rerunning the
command is safe.

This process reads the national ArcGIS feed and performs bounded, set-based database
updates. It does not call council detail APIs, trigger page revalidation, or increase
the independently rate-limited full-proposal backfill pressure.
