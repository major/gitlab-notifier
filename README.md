# GitLab Notifier

A Firefox extension that keeps you up to date with activity across one or more GitLab instances — without leaving your browser.

## Features

- **Multi-instance support** — monitor gitlab.com and any number of self-hosted GitLab instances simultaneously
- **4 notification types** — TODOs, Issues, Merge Requests, and CI Pipelines
- **Unified notification list** — all notifications in one place, filterable by type
- **Desktop notifications** — OS-level popups for new activity, click to open in browser
- **Configurable polling** — check for updates every 1–60 minutes (default: 5)
- **Light/dark theme** — auto-detects your system preference, with manual override
- **Privacy-first** — all data stored locally in your browser; your tokens never leave your machine

## Installation

Download the latest signed `.xpi` from the [Releases page](https://github.com/major/gitlab-notifier/releases) and drag it into Firefox.

## Setup

### Step 1 — Add a GitLab instance

Click the GitLab Notifier icon in your toolbar → click the ⚙️ gear icon → **Settings**.

Click **+ Add Instance** and fill in:
- **Name** — a label for this instance (e.g. "Work GitLab" or "gitlab.com")
- **GitLab URL** — the base URL of your GitLab instance (e.g. `https://gitlab.com`)
- **Personal Access Token** — see below

### Step 2 — Create a Personal Access Token

1. Go to your GitLab instance → **User Settings → Access Tokens**
   - Direct link: `{your-gitlab-url}/-/user_settings/personal_access_tokens`
2. Click **Add new token**
3. Give it a name (e.g. `GitLab Notifier`)
4. Set an expiration date (optional but recommended)
5. Select the **`read_api`** scope — this is the only scope required
6. Click **Create personal access token**
7. **Copy the token immediately** — you won't be able to see it again

Paste the token into the extension settings and click **Test Connection** to verify.

### Step 3 — Configure notifications

In Settings, choose which notification types to enable:
- **TODOs** — tasks assigned to you
- **Issues** — issues assigned to you
- **Merge Requests** — MRs assigned to or reviewed by you
- **CI Pipelines** — pipeline status for projects you're a member of

You can also set the polling interval and toggle desktop notifications.

## Notification Types

| Type | What triggers it |
|------|-----------------|
| TODOs | Any pending TODO assigned to you |
| Issues | Issues assigned to you that have been updated |
| Merge Requests | MRs assigned to you or where you're a reviewer |
| CI Pipelines | Pipeline runs in projects you're a member of |

## Privacy

- All data (tokens, notifications, settings) is stored locally in your browser using `browser.storage.local`
- Your Personal Access Tokens are never sent anywhere except to the GitLab instance you configured
- No analytics, no telemetry, no external servers
- The extension only makes requests to GitLab instances you explicitly add

## License

MIT
