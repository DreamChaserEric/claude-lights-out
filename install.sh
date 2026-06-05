#!/bin/bash
set -e

DEST="$HOME/.claude/lights-out"
REPO="https://github.com/DreamChaserEric/claude-lights-out"

echo "🔧 claude-lights-out installer"
echo ""

if [ -d "$DEST" ]; then
  echo "Updating existing installation..."
  cd "$DEST" && git pull --quiet
else
  echo "Installing to $DEST..."
  git clone --depth 1 "$REPO" "$DEST"
fi

mkdir -p "$HOME/.claude/commands"

ln -sf "$DEST/lightsout.md" "$HOME/.claude/commands/lightsout.md"
ln -sf "$DEST/lightsout-retro.md" "$HOME/.claude/commands/lightsout-retro.md"

echo ""
echo "✓ Installed successfully."
echo ""
echo "Usage:"
echo "  /lightsout Build a REST API with Express and Postgres"
echo "  /lightsout Fix: the search endpoint returns stale results"
echo "  /lightsout-retro  Review the last pipeline run quality"
echo ""
echo "Update later:  cd $DEST && git pull"
echo "Uninstall:     rm -rf $DEST ~/.claude/commands/lightsout.md ~/.claude/commands/lightsout-retro.md"
