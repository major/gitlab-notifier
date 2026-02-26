# Contributing to GitLab Notifier

## Prerequisites

- Node.js 20 or later
- npm
- Firefox (for local testing)

## Development Setup

```bash
git clone https://github.com/major/gitlab-notifier.git
cd gitlab-notifier
npm install
```

## Running Locally

```bash
npm run start
```

This opens Firefox with the extension loaded and hot-reloads on file changes (via `web-ext run`).

## Building

```bash
npm run build
```

Produces `web-ext-artifacts/gitlab_notifier-*.zip`.

Or use the build script directly:

```bash
./build.sh -f    # build Firefox extension
./build.sh -c    # clean build artifacts
./build.sh -h    # show help
```

## Linting

```bash
npm run lint
```

Runs `web-ext lint` against the `firefox/` directory. All PRs must pass lint with 0 errors.

## Testing

```bash
npm test
```

Runs the unit test suite with vitest. Tests cover storage logic, API client error handling, notification normalization, badge text, and theme logic.

## Project Structure

```
firefox/
  manifest.json       # MV2 extension manifest
  background.js       # Polling engine, alarm management, message handling
  storage.js          # Data layer (browser.storage.local)
  gitlab-api.js       # GitLab REST API v4 client
  popup/              # Extension popup UI
    popup.html
    popup.js
    popup.css
  options/            # Settings page
    options.html
    options.js
    options.css
  icons/              # Extension icons
tests/                # Unit tests (vitest)
.github/workflows/    # GitHub Actions CI/CD
```

## Releasing

Releases are automated via `release-it` and GitHub Actions.

```bash
npm run release:patch   # bump patch version (0.1.0 → 0.1.1)
npm run release:minor   # bump minor version (0.1.0 → 0.2.0)
npm run release:major   # bump major version (0.1.0 → 1.0.0)
```

This will:
1. Bump the version in `package.json` and `firefox/manifest.json`
2. Generate a changelog entry
3. Create a git tag
4. Push to GitHub, triggering the release workflow

The GitHub Actions workflow then builds, signs, and publishes the `.xpi` to the Releases page.

See [SIGNING.md](SIGNING.md) for signing setup.
