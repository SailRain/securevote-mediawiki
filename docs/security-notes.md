# Security notes

SecureVote is a practical local workaround for private voting on MediaWiki. It is not equivalent to SecurePoll.

## What it hides

For ordinary users, SecureVote hides:

- current vote counts;
- voter names;
- vote choices;
- vote reasons;
- the private AbuseLog entries used as the ballot box.

The submit endpoint edit is disallowed, so the vote payload should not become a public page revision when the AbuseFilter is configured correctly.

## Who can still see or affect data

The following people or roles may be able to see or affect vote data:

- server operators;
- users with private AbuseLog rights;
- users who can edit site JavaScript;
- users who can edit the SecureVote config page;
- users who can edit or disable the SecureVote AbuseFilter;
- users who can change rights or user groups;
- users who can edit interface messages involved in the workflow.

Use SecureVote only when that trust model is acceptable.

## Operational recommendations

- Keep private AbuseLog rights limited to trusted scrutineers.
- Do not grant private AbuseFilter viewing rights to ordinary admins unless intended.
- Protect the SecureVote config page if your wiki allows interface-page protection.
- Keep the AbuseFilter hidden and enabled.
- The AbuseFilter must disallow matching edits.
- Test the endpoint before every important vote.
- Publish only aggregate results unless your local rules permit more detail.
