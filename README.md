<h1 align="center">SecureVote for MediaWiki</h1>

<p align="center">
  Lightweight private voting for MediaWiki communities without SecurePoll access.
</p>

<p align="center">
  <img alt="license MIT" src="https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square">
  <img alt="MediaWiki gadget" src="https://img.shields.io/badge/MediaWiki-gadget-3366cc?style=flat-square">
  <img alt="private voting" src="https://img.shields.io/badge/private-voting-6f42c1?style=flat-square">
  <img alt="AbuseFilter" src="https://img.shields.io/badge/AbuseFilter-ready-005f73?style=flat-square">
  <img alt="Miraheze ready" src="https://img.shields.io/badge/Miraheze-ready-0a7f64?style=flat-square">
</p>

<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">中文</a>
</p>

SecureVote is a lightweight private voting tool for MediaWiki wikis. It is designed for communities that want SecurePoll-like private voting but do not have access to the SecurePoll extension.

It works by submitting a structured payload to a dedicated wiki page and using a hidden AbuseFilter to privately log and disallow that edit. Voters only see a submit form and success/failure status. Authorized scrutineers can read the private AbuseLog through an admin page and count votes using the "latest vote counts" rule.

This project is a local approximation, not a cryptographic replacement for SecurePoll. Server operators and users with high-level wiki configuration, JavaScript, or AbuseFilter permissions can still affect the system.

## Contents

- `src/MediaWiki_Gadget-SecureVote.js` - main JavaScript source.
- `wiki/Template_SecureVote.wikitext` - the voting form anchor template.
- `wiki/Project_SecureVote_Admin.wikitext` - admin/scrutineer dashboard page.
- `wiki/Project_SecureVote_Submit.wikitext` - private submit endpoint page.
- `wiki/MediaWiki_SecureVote-config.example.json` - sample poll configuration.
- `wiki/MediaWiki_Securevote-vote-received.wikitext` - AbuseFilter disallow message.
- `wiki/AbuseFilter_SecureVote.rules.txt` - sample AbuseFilter condition.
- `wiki/Gadgets-definition.example.wikitext` - optional Gadget definition.
- `wiki/Common.js.example` - recommended site-wide loader.
- `docs/security-notes.md` - security model and limitations.

## Requirements

You need a MediaWiki wiki where you can:

- edit `MediaWiki:` interface pages;
- create/edit pages in the project namespace;
- create and manage AbuseFilter filters;
- create a hidden/private AbuseFilter;
- grant private AbuseLog viewing permissions to a small trusted group;
- enable site JavaScript or load the script through a default Gadget.

On Miraheze-hosted wikis, this normally requires bureaucrat/wiki-manager style permissions plus AbuseFilter management permissions. On other MediaWiki installations, use the equivalent interface-administrator and AbuseFilter rights.

## Permission setup

Create a small trusted user group for vote scrutineers, for example:

- group name: `securevote-scrutineer`
- display name: `SecureVote scrutineer`

Grant this group only the permissions needed to read private AbuseFilter logs. Exact right names depend on your wiki version, but the important rights are usually:

- `abusefilter-log`
- `abusefilter-log-detail`
- `abusefilter-log-private`
- `abusefilter-view-private`

Grant the same private-log viewing rights to bureaucrats or the people who will supervise elections.

Do not give private AbuseFilter log rights to ordinary administrators unless you want them to see private votes.

## Installation

### 1. Create the JavaScript page

Create:

`MediaWiki:Gadget-SecureVote.js`

Paste the contents of:

`src/MediaWiki_Gadget-SecureVote.js`

### 2. Create the voting template

Create:

`Template:SecureVote`

Paste:

`wiki/Template_SecureVote.wikitext`

Voting pages use this template as the visible form anchor:

`{{SecureVote|id=example-2026-01}}`

### 3. Create the submit endpoint

Create a page in your wiki's project namespace:

`Project:SecureVote/Submit`

On many wikis, `Project:` is an alias for the local project namespace. If your wiki displays a site-specific project namespace name, use that namespace. Paste:

`wiki/Project_SecureVote_Submit.wikitext`

### 4. Create the admin dashboard

Create:

`Project:SecureVote/Admin`

Paste:

`wiki/Project_SecureVote_Admin.wikitext`

Only users with the private AbuseLog rights should see vote records there.

### 5. Create the configuration page

Create:

`MediaWiki:SecureVote-config.json`

Paste and edit:

`wiki/MediaWiki_SecureVote-config.example.json`

Polls are defined under `polls`. Each key is a poll ID. The ID must match the `id` passed to `{{SecureVote}}`.

Example:

`{{SecureVote|id=example-2026-01}}`

must match:

`"example-2026-01": { ... }`

### 6. Create the AbuseFilter disallow message

Create:

`MediaWiki:Securevote-vote-received`

Paste:

`wiki/MediaWiki_Securevote-vote-received.wikitext`

### 7. Create the private AbuseFilter

Create a new AbuseFilter. Use a condition based on:

`wiki/AbuseFilter_SecureVote.rules.txt`

Important configuration:

- Enabled: yes
- Hidden/private: yes
- Action: disallow
- Disallow message: `securevote-vote-received`
- The filter should match edits to your SecureVote submit endpoint.

Replace `YOUR_PROJECT_NAMESPACE` in the rule with the actual project namespace prefix shown in `page_prefixedtitle` on your wiki.

The filter must disallow the edit. If it only tags or warns, vote payloads may become public page revisions.

### 8. Load the script site-wide

Recommended: edit `MediaWiki:Common.js` and add the loader from:

`wiki/Common.js.example`

This makes SecureVote available to all users automatically. IP/anonymous users still cannot submit; the script checks login and edit rights.

Optional: if you prefer Gadget management, add the definition from:

`wiki/Gadgets-definition.example.wikitext`

Then enable it by default or through your wiki's normal Gadget configuration. The Common.js loader is simpler for small private/local deployments.

## Creating a vote

1. Create a public voting page, for example `Project:Votes/Example vote`.
2. Write the proposal, voting eligibility, start/end time, and counting rule in normal wikitext.
3. Place the form anchor:

`{{SecureVote|id=example-2026-01}}`

4. Add the corresponding poll object in `MediaWiki:SecureVote-config.json`.
5. Confirm the form appears to logged-in users.
6. Confirm anonymous users only see a login notice or no usable submit form.

## Poll configuration fields

Each poll supports:

- `title` - visible title on the form and admin page.
- `description` - short form description; keep long rules on the voting page.
- `enabled` - `true` to allow submissions; `false` to close or pause.
- `start` - ISO-like start time, for example `2026-06-05T00:00:00+08:00`.
- `end` - ISO-like end time.
- `allowReason` - `true` to show an optional reason field.
- `options` - list of choices with internal `id` and visible `label`.

Do not reuse poll IDs for different votes.

## Counting votes

Open:

`Project:SecureVote/Admin`

The admin page first shows a list of all configured or logged poll projects, including ended and disabled polls. Each item shows:

- status: not started, open, ended, closed, invalid config, or missing config;
- start/end times;
- effective vote count;
- all submissions count;
- invalid submissions count.

Click a poll to view only that poll's results:

- Summary: total effective votes plus per-option counts and percentages.
- Effective votes: one row per user, using the latest valid submission.
- All parsed submissions: audit trail for repeat votes and changed votes.
- Invalid submissions: submissions whose poll or option no longer matches config.
- CSV export: exports the effective votes for the selected poll only.

The default counting rule is: same user + same poll = latest valid vote counts.

## Testing checklist

Before using SecureVote for a real vote:

1. Use a private test poll ID.
2. Submit a test vote as a registered user.
3. Verify the submit endpoint page history does not contain the vote payload.
4. Verify the hidden AbuseLog contains the submission.
5. Verify the admin page shows the vote.
6. Submit a second vote from the same user and verify only the latest one counts.
7. Test an ended poll and a disabled poll.
8. Test mobile and desktop display.
9. Remove or archive the test poll configuration before the real vote if needed.

## Privacy and security notes

See `docs/security-notes.md`.

## License

MIT License. See `LICENSE`.
