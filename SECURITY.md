\# Security Policy



\## Reporting a Vulnerability



\*\*Do not open a public issue.\*\*  

Sinth follows a coordinated vulnerability disclosure process.



Submit reports via the \*\*GitHub Security Advisory\*\* system (Security tab) or

email \*\*\[security@sinth.dev]\*\*. A PGP key for sensitive communications is

available \[here](#).



**Timeline:**



- Acknowledgment within **48 hours**
- Initial assessment within **5 business days**
- Coordinated disclosure embargo: up to **90 days** (extensions negotiated case‑by‑case)



You will receive status updates throughout the process. Vulnerability

details must remain confidential until a public advisory is released.



Credit is given in the published advisory unless you request anonymity.



## Supported Versions



Security patches are provided only for the following versions:



| Version | Supported          | Status              |
|---------|--------------------|---------------------|
| 1.8.x   | :white_check_mark: | Active support      |
| < 1.8   | :x:                | End of life         |



Users must upgrade to a supported version before a report can be triaged.



## Scope



Sinth is a compiler that actively transforms source code. The following are

in scope:



- **Silent miscompilation** – Incorrect output without error or warning,

&#x20; especially when that output could result in exploitable or unsafe behaviour.

- **Code generation vulnerabilities\*\* – Compiler‑emitted code that introduces

&#x20; injection vectors, memory‑safety violations, or privilege‑escalation paths.

- **Input exploitation\*\* – Crafted source files that cause the compiler to

&#x20; leak information, gain unauthorised access, or exhibit undefined behaviour

&#x20; during compilation.



\### Out of Scope



\- Denial‑of‑service through resource exhaustion, unless it leads to

&#x20; exploitable undefined behaviour.

\- Crashes, hangs, or incorrect error messages that do \*\*not\*\* produce

&#x20; incorrect output (file these as standard Issues).

\- Vulnerabilities in user code produced by Sinth where the root cause is

&#x20; the user’s own logic, not a compiler defect.

\- Vulnerabilities in third‑party dependencies, unless Sinth’s specific

&#x20; usage or configuration enables the issue.



\## Disclosure and Remediation Process



1\. \*\*Triage\*\* – Severity and impact are assessed against the latest stable

&#x20;  release.

2\. \*\*Fix development\*\* – A patch is created and tested across all supported

&#x20;  version lines.

3\. \*\*Backport\*\* – The fix is applied to every actively supported release.

4\. \*\*Advisory publication\*\* – A GitHub Security Advisory is released with a

&#x20;  clear impact assessment, CVSS score, and upgrade instructions.

5\. \*\*Recognition\*\* – Reporters are credited in the advisory (unless

&#x20;  anonymity has been requested).



Critical vulnerabilities are typically addressed within \*\*7 days\*\*. Lower‑severity

issues follow the standard release cadence.



\## Recognition



We gratefully acknowledge the security researchers who have responsibly

disclosed vulnerabilities to Sinth. Their contributions are recorded in our

published \[Security Advisories](https://github.com/Yannosay/sinth/security/advisories)

and, with consent, in release notes.



\---



\*This policy is effective as of 2026‑06‑04 and applies to all versions of Sinth.\*

