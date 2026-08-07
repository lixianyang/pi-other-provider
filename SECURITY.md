# Security Policy

## Supported versions

Until the project reaches `1.0.0`, only the latest published version receives security fixes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository:

https://github.com/lixianyang/pi-other-provider/security/advisories/new

Do not open a public issue for a suspected vulnerability. Do not include API keys, access tokens, credentials, or other
secrets in reports, logs, screenshots, or reproductions.

Include the affected version, impact, reproduction steps, and any suggested mitigation. You should receive an initial
response within seven days. Confirmed vulnerabilities will be handled through a private advisory until a fix is ready.

## Credential handling

This extension receives credentials from pi at runtime and must not persist them. Provider implementations and tests
must use synthetic credentials only.
