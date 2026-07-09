## What & why

<!-- 1–3 sentences. Link the doc/decision if one exists. -->

## Verification evidence

<!-- Paste actual command output (lint / typecheck / build / test). "It works" doesn't count. -->

```
(paste output here)
```

## Checklist

- [ ] No demographic / protected-attribute features introduced (code, prompts, scenarios)
- [ ] Nothing scores, flags, or describes a real person
- [ ] No secrets in the diff (.env stays local; new vars documented in `server/.env.example`)
- [ ] If `shared/contracts/` changed: teammates pinged before merge
- [ ] Diff is scoped to this task (no drive-by refactors)
