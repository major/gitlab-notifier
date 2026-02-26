#!/usr/bin/env bash
set -euo pipefail

show_help() {
    cat << EOF
Usage: ./build.sh [OPTION]

Build the GitLab Notifier Firefox extension.

Options:
  -h, --help    Show this help message
  -f, --firefox Build Firefox extension (default)
   -s, --sign    Build and sign Firefox extension (requires WEB_EXT_API_KEY and WEB_EXT_API_SECRET)
   -c, --clean   Clean build artifacts

Environment variables:
   WEB_EXT_API_KEY    Mozilla API key (JWT issuer)
   WEB_EXT_API_SECRET    Mozilla API secret

Get Firefox API credentials at: https://addons.mozilla.org/en-US/developers/addon/api/key/
EOF
}

build_firefox() {
    echo "🦊 Building Firefox extension..."
    npm run build
    echo "✅ Firefox: web-ext-artifacts/*.zip"
}

sign_firefox() {
     if [[ -z "${WEB_EXT_API_KEY:-}" ]] || [[ -z "${WEB_EXT_API_SECRET:-}" ]]; then
         echo "❌ Error: Signing requires WEB_EXT_API_KEY and WEB_EXT_API_SECRET"
         echo ""
         echo "Set them via environment variables or create a .env file:"
         echo "  export WEB_EXT_API_KEY='your-api-key'"
         echo "  export WEB_EXT_API_SECRET='your-api-secret'"
         echo ""
         echo "Get credentials at: https://addons.mozilla.org/en-US/developers/addon/api/key/"
         exit 1
     fi

     echo "🔏 Building and signing Firefox extension..."
     npx web-ext sign \
         --source-dir firefox \
         --api-key="$WEB_EXT_API_KEY" \
         --api-secret="$WEB_EXT_API_SECRET" \
         --channel=unlisted

     echo "✅ Signed Firefox extension in web-ext-artifacts/"
}

clean_artifacts() {
    echo "🧹 Cleaning build artifacts..."
    rm -rf web-ext-artifacts/
    echo "✅ Cleaned"
}

# Parse arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    -f|--firefox)
        build_firefox
        ;;
    -s|--sign)
        sign_firefox
        ;;
    -c|--clean)
        clean_artifacts
        ;;
    "")
        build_firefox
        ;;
    *)
        echo "❌ Unknown option: $1"
        show_help
        exit 1
        ;;
esac
