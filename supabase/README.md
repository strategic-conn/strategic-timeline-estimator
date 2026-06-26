# supabase/

SQL source of truth for the backend. The app currently runs on local demo data
(Zustand + `localStorage`); this folder is what gets applied when we go live.

## Layout

```
supabase/
├── migrations/
│   ├── 0001_init.sql   # schema (tables, enums, profile trigger)
│   └── 0002_rls.sql    # Row-Level Security = the permission matrix
└── README.md
```

## First-time setup

```bash
npm i -g supabase            # or: npx supabase ...
supabase init                # generates config.toml (not committed yet)
supabase link --project-ref <your-project-ref>
supabase db push             # applies migrations/ in order
npm run db:types             # regenerate types/database.types.ts
```

Then put the project URL + keys in `.env.local` (see `.env.example`).

## Notes

- **RLS mirrors `usePermissions()`.** If you change one, change the other.
- Proposals are stored as a JSONB document (`line_items` + `addons`) for v1 to
  match the estimator's self-contained shape; normalize later if needed.
- Full rationale + frontend wiring patterns: [`docs/backend-supabase.md`](../docs/backend-supabase.md).
