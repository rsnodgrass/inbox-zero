#!/bin/bash
# publish-ghcr.sh - Publish inbox-zero to GitHub Container Registry
#
# Builds and pushes a multi-platform Docker image to your personal GHCR.
# Useful for running your own inbox-zero fork in Docker/Kubernetes without
# depending on the upstream elie222/inbox-zero image.
#
# Prerequisites:
#   - gh CLI authenticated: gh auth login
#   - Docker buildx for multi-platform: docker buildx create --use --name multiplatform
#
# Usage:
#   ./docker/scripts/publish-ghcr.sh          # tag with git SHA
#   ./docker/scripts/publish-ghcr.sh v1.0.0   # tag with custom version
#
# After first publish, make package public:
#   GitHub → Profile → Packages → inbox-zero → Settings → Change visibility → Public
#
set -euo pipefail

# Configuration
IMAGE_NAME="inbox-zero"
REGISTRY="ghcr.io"
DOCKERFILE="docker/Dockerfile.prod"

# Auto-detect GitHub username from gh CLI (can override with env var)
GITHUB_USERNAME="${GITHUB_USERNAME:-$(gh api user -q .login)}"

# Tag defaults to git SHA
TAG="${1:-$(git rev-parse --short HEAD)}"
FULL_IMAGE="${REGISTRY}/${GITHUB_USERNAME}/${IMAGE_NAME}"

echo "Building ${FULL_IMAGE}:${TAG}"

# Login to GHCR (uses gh CLI for auth)
echo "Logging into GHCR..."
gh auth token | docker login ghcr.io -u "${GITHUB_USERNAME}" --password-stdin

# Build multi-platform and push
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --file "${DOCKERFILE}" \
  --tag "${FULL_IMAGE}:${TAG}" \
  --tag "${FULL_IMAGE}:latest" \
  --push \
  .

echo "Published:"
echo "  ${FULL_IMAGE}:${TAG}"
echo "  ${FULL_IMAGE}:latest"
echo ""
echo "Make package public: https://github.com/${GITHUB_USERNAME}?tab=packages"
