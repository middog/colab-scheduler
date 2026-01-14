#!/bin/bash

# =============================================================================
# 💾 SDCoLab Scheduler - Setup Persistent Terraform State
#
# This script sets up a persistent directory for Terraform state that survives
# app directory rebuilds/updates.
#
# Run once to configure, then deploy normally:
#   ./scripts/setup-persistent-state.sh
#   ./scripts/deploy.sh
#
# =============================================================================

set -e

# Default state directory
DEFAULT_STATE_DIR="$HOME/.sdcolab-terraform"

echo "💾 SDCoLab Scheduler - Persistent State Setup"
echo "═══════════════════════════════════════════════"
echo ""

# Check for existing state in the infrastructure directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INFRA_DIR="$PROJECT_DIR/infrastructure"

# Ask user for state directory
echo "Where would you like to store Terraform state?"
echo ""
echo "  This directory will persist across app updates/rebuilds."
echo "  Default: $DEFAULT_STATE_DIR"
echo ""
read -p "State directory [$DEFAULT_STATE_DIR]: " STATE_DIR
STATE_DIR="${STATE_DIR:-$DEFAULT_STATE_DIR}"

# Expand ~ if present
STATE_DIR="${STATE_DIR/#\~/$HOME}"

echo ""
echo "📁 Using state directory: $STATE_DIR"

# Create the state directory
mkdir -p "$STATE_DIR/.terraform"
echo "   ✅ Created $STATE_DIR/.terraform"

# Check for existing state to migrate
if [ -d "$INFRA_DIR/.terraform" ] && [ ! -L "$INFRA_DIR/.terraform" ]; then
  echo ""
  echo "   📦 Found existing .terraform directory"
  echo "   → Migrating to persistent location..."
  cp -r "$INFRA_DIR/.terraform/"* "$STATE_DIR/.terraform/" 2>/dev/null || true
  rm -rf "$INFRA_DIR/.terraform"
  echo "   ✅ Migrated .terraform contents"
fi

if [ -f "$INFRA_DIR/terraform.tfstate" ] && [ ! -L "$INFRA_DIR/terraform.tfstate" ]; then
  echo ""
  echo "   📦 Found existing terraform.tfstate"
  echo "   → Migrating to persistent location..."
  mv "$INFRA_DIR/terraform.tfstate" "$STATE_DIR/"
  echo "   ✅ Migrated terraform.tfstate"
fi

if [ -f "$INFRA_DIR/terraform.tfstate.backup" ] && [ ! -L "$INFRA_DIR/terraform.tfstate.backup" ]; then
  mv "$INFRA_DIR/terraform.tfstate.backup" "$STATE_DIR/"
  echo "   ✅ Migrated terraform.tfstate.backup"
fi

# Create symlinks
cd "$INFRA_DIR"

if [ ! -L ".terraform" ]; then
  ln -sf "$STATE_DIR/.terraform" .terraform
  echo "   🔗 Linked .terraform → $STATE_DIR/.terraform"
fi

if [ -f "$STATE_DIR/terraform.tfstate" ] && [ ! -L "terraform.tfstate" ]; then
  ln -sf "$STATE_DIR/terraform.tfstate" terraform.tfstate
  echo "   🔗 Linked terraform.tfstate → $STATE_DIR/terraform.tfstate"
fi

if [ -f "$STATE_DIR/terraform.tfstate.backup" ] && [ ! -L "terraform.tfstate.backup" ]; then
  ln -sf "$STATE_DIR/terraform.tfstate.backup" terraform.tfstate.backup
  echo "   🔗 Linked terraform.tfstate.backup"
fi

# Create a marker file so we know this was set up
echo "$STATE_DIR" > "$STATE_DIR/.sdcolab-state-dir"

echo ""
echo "═══════════════════════════════════════════════"
echo "✅ Persistent state configured!"
echo ""
echo "Your Terraform state is now stored in:"
echo "  $STATE_DIR"
echo ""
echo "When you update/rebuild the app:"
echo "  1. Extract new version"
echo "  2. Run: ./scripts/setup-persistent-state.sh"
echo "     (It will detect and relink existing state)"
echo "  3. Run: ./scripts/deploy.sh"
echo ""
echo "Or use TF_STATE_DIR environment variable:"
echo "  export TF_STATE_DIR=$STATE_DIR"
echo "  ./scripts/deploy.sh"
echo ""

# Add to shell profile suggestion
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
  echo "💡 To make this permanent, add to $SHELL_RC:"
  echo ""
  echo "  echo 'export TF_STATE_DIR=$STATE_DIR' >> $SHELL_RC"
  echo ""
fi
