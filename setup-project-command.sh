#!/bin/bash

# Setup script for /project command

# Create alias for quick access
echo "Creating /project command alias..."

# Add to bash/zsh profile
SHELL_RC="$HOME/.zshrc"
if [ -f "$HOME/.bashrc" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

# Check if alias already exists
if ! grep -q "alias project=" "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# Claude Code Project Navigator" >> "$SHELL_RC"
  echo "alias project='node $PWD/interactive-project-menu.js'" >> "$SHELL_RC"
  echo "Alias added to $SHELL_RC"
else
  echo "Alias already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Usage:"
echo "  project     - Launch interactive project menu"
echo ""
echo "Controls:"
echo "  ↑/↓ or j/k  - Navigate"
echo "  Enter       - Select project"
echo "  1-9         - Quick jump to project"
echo "  g/G         - Jump to top/bottom"
echo "  q           - Quit"
echo ""
echo "Run 'source $SHELL_RC' to activate or restart your terminal"