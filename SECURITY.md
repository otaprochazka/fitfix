# Security Policy

## Supported Versions

Only the latest commit on `main` is actively maintained.
Older snapshots are unsupported; please update before reporting.

## Reporting a Vulnerability

**Preferred:** [GitHub Security Advisory](https://github.com/otaprochazka/fitfix/security/advisories/new) (private disclosure, recommended)

**Alternative:** e-mail `otaprochazka@gmail.com` with subject `[FitFix Security]`.

Please include: steps to reproduce, affected browser/OS, and a proof-of-concept if possible.

## What We Especially Care About

- XSS via malformed `.FIT` or `.TCX` input (field strings rendered into the DOM)
- Prototype pollution in the FIT/TCX parser or merge pipeline
- Supply-chain issues (compromised dependency, typosquatting)
- CSP bypass that allows exfiltration of parsed activity data

## What Is NOT a Vulnerability

- Denial-of-service via a very large file — FitFix runs entirely in a single browser tab with no server; a tab crash affects only the user who opened the file.
- Missing rate-limiting or authentication — there is no backend.
- Issues in unmaintained forks or third-party deployments.

## Disclosure Timeline

| Milestone | Target |
|-----------|--------|
| Acknowledge receipt | 7 days |
| Triage & confirm | 14 days |
| Fix attempt / workaround | 30 days |
| Public disclosure | After fix lands on `main`, coordinated with reporter |

We are a small open-source project; timelines are best-effort. Thank you for helping keep FitFix safe.
