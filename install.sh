#!/bin/bash
#
# GitBoard Remote Installer
# Install GitBoard to any project directly from GitHub
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jaymel-tapel/gitboard/main/install.sh | bash -s -- /path/to/project
#
# Options (pass after --):
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

# Check for target directory
if [ -z "$1" ] || [[ "$1" == -* ]]; then
    echo -e "${RED}Error: Target directory is required${NC}"
    echo ""
    echo "Usage:"
    echo "  curl -fsSL https://raw.githubusercontent.com/jaymel-tapel/gitboard/main/install.sh | bash -s -- /path/to/project [options]"
    echo ""
    echo "Options:"
    echo "  --update          Update existing installation (preserve data)"
    echo "  --personal        Add .gitboard/ to .gitignore"
    echo "  --shared          Keep .gitboard/ tracked by git (default)"
    echo "  --name \"Name\"     Project name"
    echo "  --code CODE       Ticket code prefix (e.g., PROJ)"
    echo ""
    echo "Examples:"
    echo "  # Fresh install"
    echo "  curl -fsSL .../install.sh | bash -s -- /path/to/my-project"
    echo ""
    echo "  # Update existing"
    echo "  curl -fsSL .../install.sh | bash -s -- /path/to/my-project --update"
    exit 1
fi

TARGET="$1"
shift

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
