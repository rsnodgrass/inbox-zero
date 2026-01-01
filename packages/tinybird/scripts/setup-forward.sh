#!/bin/bash
# Setup script for Tinybird Forward workspace
# Deploys both inbox-zero-stats and inbox-zero-ai-analytics
#
# Prerequisites:
#   - Tinybird CLI installed (pip install tinybird-cli or use Docker)
#   - Tinybird Forward workspace created
#   - Admin token from workspace settings
#
# Usage:
#   TINYBIRD_TOKEN=your_token ./setup-forward.sh
#   # or
#   ./setup-forward.sh --token your_token
#
# Environment variables:
#   TINYBIRD_TOKEN  - Admin token (required)
#   TINYBIRD_REGION - API region: us-east (default), us-west-2, eu-west-1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TINYBIRD_DIR="$(dirname "$SCRIPT_DIR")"
AI_ANALYTICS_DIR="$TINYBIRD_DIR/../tinybird-ai-analytics"

# defaults
TOKEN="${TINYBIRD_TOKEN:-}"
REGION="${TINYBIRD_REGION:-us-east}"

# parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--token TOKEN] [--region REGION]"
      echo ""
      echo "Options:"
      echo "  --token   Tinybird admin token (or set TINYBIRD_TOKEN)"
      echo "  --region  API region: us-east (default), us-west-2, eu-west-1"
      echo ""
      echo "Regions:"
      echo "  us-east   https://api.us-east.tinybird.co/"
      echo "  us-west-2 https://api.us-west-2.aws.tinybird.co/"
      echo "  eu-west-1 https://api.tinybird.co/"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "Error: TINYBIRD_TOKEN not set"
  echo "Set TINYBIRD_TOKEN environment variable or use --token"
  exit 1
fi

# map region to base url
case "$REGION" in
  us-east)
    BASE_URL="https://api.us-east.tinybird.co/"
    ;;
  us-west-2)
    BASE_URL="https://api.us-west-2.aws.tinybird.co/"
    ;;
  eu-west-1|eu)
    BASE_URL="https://api.tinybird.co/"
    ;;
  *)
    echo "Unknown region: $REGION"
    echo "Valid regions: us-east, us-west-2, eu-west-1"
    exit 1
    ;;
esac

echo "Tinybird Forward Workspace Setup"
echo "================================="
echo "Region: $REGION"
echo "Base URL: $BASE_URL"
echo ""

# authenticate
echo "Authenticating with Tinybird..."
export TB_HOST="$BASE_URL"
tb login --token "$TOKEN"

# deploy inbox-zero-stats
echo ""
echo "Deploying inbox-zero-stats..."
cd "$TINYBIRD_DIR"
tb deploy --yes

# deploy inbox-zero-ai-analytics
echo ""
echo "Deploying inbox-zero-ai-analytics..."
cd "$AI_ANALYTICS_DIR"
tb deploy --yes

echo ""
echo "Setup complete!"
echo ""
echo "Add these to your .env file:"
echo "  TINYBIRD_TOKEN=$TOKEN"
echo "  TINYBIRD_BASE_URL=$BASE_URL"
