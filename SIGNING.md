# Signing the Extension

Firefox requires extensions to be signed by Mozilla to install without developer mode. This project uses the [Mozilla Add-on Developer Hub (AMO)](https://addons.mozilla.org/developers/) API for signing.

## Getting Mozilla API Credentials

1. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)
2. Sign in with your Firefox Account
3. Go to **Tools → Manage API Keys**
4. Generate a new API key pair — you'll get a **JWT issuer** and **JWT secret**

## Local Signing

Create a `.env` file in the project root (never commit this):

```
AMO_JWT_ISSUER=user:12345678:123
AMO_JWT_SECRET=your-jwt-secret-here
```

Then run:

```bash
source .env
npm run sign
```

Or use the build script:

```bash
AMO_JWT_ISSUER=... AMO_JWT_SECRET=... ./build.sh -s
```

The signed `.xpi` will appear in `web-ext-artifacts/`.

## GitHub Actions Setup

The release workflow reads signing credentials from repository secrets. Add these in your GitHub repository settings under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `AMO_JWT_ISSUER` | Your Mozilla API JWT issuer |
| `AMO_JWT_SECRET` | Your Mozilla API JWT secret |

The workflow triggers automatically on tags matching `v*` (e.g. `v0.1.0`).

## Notes

- Signed `.xpi` files can be installed in any Firefox without developer mode
- The extension ID in `manifest.json` must match the ID registered on AMO (or be a new submission)
- First-time submissions go through AMO review; updates to existing extensions are auto-signed
