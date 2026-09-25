# Security log

This file records remediation steps only. Never add credential values, connection strings, database rows, or personal data.

## 2026-09-25 — Public database credential and recovery artifacts

- A Neon connection string was included in a test fixture in the public snapshot.
- Generated recovery output, including a database dump and transcript, was also in the published tree. The dump contains email-shaped and phone-shaped values, so it is treated as private data.
- The test fixture now uses example-only credentials and a reserved example hostname. Generated recovery output is ignored and excluded from the cleaned public snapshot.
- The Neon database password must be reset by the maintainer. Applications using it need to be updated with the replacement stored as an environment secret.
- Credential reset and live application checks remain pending.
