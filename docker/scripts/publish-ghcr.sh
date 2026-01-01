#!/bin/bash
# publish-ghcr.sh - Publish inbox-zero to GitHub Container Registry
#
# Builds and pushes a Docker image (amd64) to your personal GHCR.
# Useful for running your own inbox-zero fork in Docker/Kubernetes without
# depending on the upstream elie222/inbox-zero image.
#
# Prerequisites:
#   - gh CLI authenticated: gh auth login
#   - Docker with buildx support
#
# Usage:
#   ./docker/scripts/publish-ghcr.sh              # build and push with git SHA tag
#   ./docker/scripts/publish-ghcr.sh v1.0.0       # build and push with custom tag
#   ./docker/scripts/publish-ghcr.sh --local      # build locally only (faster)
#   ./docker/scripts/publish-ghcr.sh --local test # build locally with custom tag
#
# After first publish, make package public:
#   GitHub → Profile → Packages → inbox-zero → Settings → Change visibility → Public
#
set -euo pipefail

# Configuration
IMAGE_NAME="inbox-zero"
REGISTRY="ghcr.io"
DOCKERFILE="docker/Dockerfile.prod.local"

# Parse arguments
LOCAL_ONLY=false
TAG=""

for arg in "$@"; do
  case $arg in
    --local)
      LOCAL_ONLY=true
      ;;
    *)
      TAG="$arg"
      ;;
  esac
done

# Auto-detect GitHub username from gh CLI (can override with env var)
GITHUB_USERNAME="${GITHUB_USERNAME:-$(gh api user -q .login)}"

# Tag defaults to git SHA
TAG="${TAG:-$(git rev-parse --short HEAD)}"
FULL_IMAGE="${REGISTRY}/${GITHUB_USERNAME}/${IMAGE_NAME}"

echo "Building ${FULL_IMAGE}:${TAG}"

if [ "$LOCAL_ONLY" = true ]; then
  echo "Mode: local build (native Docker, no buildx container)"

  # Build with native Docker (avoids buildx container memory limits)
  docker build \
    --file "${DOCKERFILE}" \
    --tag "${FULL_IMAGE}:${TAG}" \
    --tag "${FULL_IMAGE}:latest" \
    .

  echo ""
  echo "Built locally:"
  echo "  ${FULL_IMAGE}:${TAG}"
  echo "  ${FULL_IMAGE}:latest"
  echo ""
  echo "Test with:"
  echo "  docker run -p 3000:3000 --env-file apps/web/.env ${FULL_IMAGE}:${TAG}"
  echo ""
  echo "Push when ready:"
  echo "  docker push ${FULL_IMAGE}:${TAG}"
  echo "  docker push ${FULL_IMAGE}:latest"
else
  echo "Mode: build and push"

  # Login to GHCR (uses gh CLI for auth)
  echo "Logging into GHCR..."
  gh auth token | docker login ghcr.io -u "${GITHUB_USERNAME}" --password-stdin

  # Build and push (amd64 only - arm64 has pnpm/next resolution issues)
  docker buildx build \
    --platform linux/amd64 \
    --file "${DOCKERFILE}" \
    --tag "${FULL_IMAGE}:${TAG}" \
    --tag "${FULL_IMAGE}:latest" \
    --push \
    .

  echo ""
  echo "Published:"
  echo "  ${FULL_IMAGE}:${TAG}"
  echo "  ${FULL_IMAGE}:latest"
  echo ""
  echo "Make package public: https://github.com/${GITHUB_USERNAME}?tab=packages"
fi
