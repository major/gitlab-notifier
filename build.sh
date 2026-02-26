#!/usr/bin/env bash
set -euo pipefail

show_help() {
    cat << EOF
Usage: ./build.sh [OPTION]

Build the GitLab Notifier Firefox extension.

Options:
  -h, --help    Show this help message
  -f, --firefox Build Firefox extension (default)
  -s, --sign    Build and sign Firefox extension (requires AMO_JWT_ISSUER and AMO_JWT_SECRET)
  -c, --clean   Clean build artifacts

Environment variables:
  AMO_JWT_ISSUER    Mozilla API key (JWT issuer)
  AMO_JWT_SECRET    Mozilla API secret

Get Firefox API credentials at: https://addons.mozilla.org/en-US/developers/addon/api/key/
EOF
}

build_firefox() {
    echo "🦊 Building Firefox extension..."
    npm run build
    echo "✅ Firefox: web-ext-artifacts/*.zip"
}

sign_firefox() {
    if [[ -z "${AMO_JWT_ISSUER:-}" ]] || [[ -z "${AMO_JWT_SECRET:-}" ]]; then
        echo "❌ Error: Signing requires AMO_JWT_ISSUER and AMO_JWT_SECRET"
        echo ""
        echo "Set them via environment variables or create a .env file:"
        echo "  export AMO_JWT_ISSUER='your-jwt-issuer'"
        echo "  export AMO_JWT_SECRET='your-jwt-secret'"
        echo ""
        echo "Get credentials at: https://addons.mozilla.org/en-US/developers/addon/api/key/"
        exit 1
    fi

    echo "🔏 Building and signing Firefox extension..."
    npx web-ext sign \
        --source-dir firefox \
        --api-key="$AMO_JWT_ISSUER" \
        --api-secret="$AMO_JWT_SECRET" \
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
