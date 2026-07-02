# Security Policy

## Supported Versions

Capicola is currently pre-1.0 and released as a single evolving line. Security
fixes are applied to the latest published version on npm.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

Once the project reaches 1.0, this table will be updated to reflect which
major versions receive security patches.

## Reporting a Vulnerability

If you believe you've found a security vulnerability in Capicola, please
report it privately first:

1. **Preferred**: open a
   [GitHub Security Advisory](https://github.com/michaelandrewgamble/capicola/security/advisories/new)
   on this repository. This lets us discuss and fix the issue before it's
   publicly disclosed.
2. **Alternative**: if you're unable to use Security Advisories, open a
   regular [GitHub issue](https://github.com/michaelandrewgamble/capicola/issues)
   with as much detail as you're comfortable sharing publicly, and we'll
   follow up to move sensitive details to a private channel.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal repro is ideal)
- The affected version(s)

### What to expect

- We aim to acknowledge reports within a few days.
- Confirmed vulnerabilities will be fixed and released as a patch version as
  soon as practical, with credit to the reporter unless anonymity is
  requested.
- Capicola is a client-side UI component with no network or server-side
  surface of its own; most reports will concern the `scripts/caption.mjs`
  build tool (which shells out to external CLIs/APIs) or dependency issues.

Thank you for helping keep Capicola and its users safe.
