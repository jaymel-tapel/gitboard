#!/bin/bash
#
# GitBoard Remote Installer
# Install GitBoard to any project directly from GitHub
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jaymel-tapel/gitboard/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/jaymel-tapel/gitboard/main/install.sh | bash -s -- [path] [options]
#
# If no path is provided, installs to current directory.
#
# Options:
#   --update          Update existing installation (preserve data)
#   --personal        Add .gitboard/ to .gitignore
#   --shared          Keep .gitboard/ tracked by git (default)
#   --name "Name"     Project name
#   --code CODE       Ticket code prefix (e.g., PROJ)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_URL="https://github.com/jaymel-tapel/gitboard.git"
TEMP_DIR=$(mktemp -d)

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}    GitBoard Remote Installer${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Determine target directory
if [ -z "$1" ] || [[ "$1" == -* ]]; then
    # No path provided or first arg is an option - use current directory
    TARGET="$(pwd)"
else
    TARGET="$1"
    shift
fi

# Resolve target to absolute path
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || {
    echo -e "${RED}Error: Target directory does not exist: $TARGET${NC}"
    exit 1
}

echo -e "Target: ${GREEN}$TARGET${NC}"
echo ""

# Clone the repository
echo -e "${BLUE}Downloading GitBoard...${NC}"
git clone --depth 1 --quiet "$REPO_URL" "$TEMP_DIR/gitboard"
echo -e "  ${GREEN}Downloaded${NC}"
echo ""

# Run the install script with all remaining arguments
"$TEMP_DIR/gitboard/gitboard-app/scripts/install.sh" "$TARGET" "$@"

echo ""
echo -e "${GREEN}Remote installation complete!${NC}"
