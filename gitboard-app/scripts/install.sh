#!/bin/bash
#
# GitBoard Installation Script
# Installs GitBoard to a target project as a standalone app
#
# Usage: ./scripts/install.sh /path/to/target-project [options]
#
# Options:
#   --update          Update app only, preserve existing data
#   --personal        Add .gitboard/ to .gitignore (personal tool, not shared)
#   --shared          Keep .gitboard/ tracked by git (default, team tool)
#   --name "Name"     Project name (will prompt if not provided)
#   --code CODE       Ticket code prefix, e.g., PROJ (will prompt if not provided)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory (where gitboard-app lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Parse arguments
TARGET=""
MODE="--shared"
UPDATE_MODE=false
PROJECT_NAME=""
TICKET_CODE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --update)
            UPDATE_MODE=true
            shift
            ;;
        --personal)
            MODE="--personal"
            shift
            ;;
        --shared)
            MODE="--shared"
            shift
            ;;
        --name)
            PROJECT_NAME="$2"
            shift 2
            ;;
        --code)
            TICKET_CODE="$2"
            shift 2
            ;;
        *)
            if [ -z "$TARGET" ]; then
                TARGET="$1"
            else
                echo -e "${RED}Error: Unexpected argument '$1'${NC}"
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate target
if [ -z "$TARGET" ]; then
    echo -e "${RED}Error: Target directory is required${NC}"
    echo ""
    echo "Usage: $0 /path/to/target-project [options]"
    echo ""
    echo "Options:"
    echo "  --update          Update app only, preserve existing data"
    echo "  --shared          Keep .gitboard/ tracked by git (default, team tool)"
    echo "  --personal        Add .gitboard/ to .gitignore (personal tool, not shared)"
    echo "  --name \"Name\"     Project name (will prompt if not provided)"
    echo "  --code CODE       Ticket code prefix, e.g., PROJ (will prompt if not provided)"
    exit 1
fi

# Resolve target to absolute path
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || {
    echo -e "${RED}Error: Target directory does not exist: $TARGET${NC}"
    exit 1
}

if [ "$UPDATE_MODE" = true ]; then
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}       GitBoard Update${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "Source:  ${GREEN}$SCRIPT_DIR${NC}"
    echo -e "Target:  ${GREEN}$TARGET${NC}"
    echo -e "${YELLOW}Mode:    update (preserving data)${NC}"
    echo ""

    # Verify .gitboard exists for update
    if [ ! -d "$TARGET/.gitboard" ]; then
        echo -e "${RED}Error: No existing .gitboard/ found at target. Use install mode instead.${NC}"
        exit 1
    fi

    # Only remove app directory, preserve data
    if [ -d "$TARGET/.gitboard/app" ]; then
        echo -e "  Removing old app files..."
        rm -rf "$TARGET/.gitboard/app"
    fi
else
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}       GitBoard Installation${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "Source:  ${GREEN}$SCRIPT_DIR${NC}"
    echo -e "Target:  ${GREEN}$TARGET${NC}"
    echo -e "Mode:    ${GREEN}${MODE#--}${NC}"
    echo ""

    # Prompt for project name if not provided
    if [ -z "$PROJECT_NAME" ]; then
        # Try to get default from target directory name
        DEFAULT_NAME="$(basename "$TARGET")"
        if [ -t 0 ]; then
            # Interactive mode - prompt user
            read -p "Project name [$DEFAULT_NAME]: " PROJECT_NAME
            PROJECT_NAME="${PROJECT_NAME:-$DEFAULT_NAME}"
        else
            # Non-interactive mode (piped) - use default
            PROJECT_NAME="$DEFAULT_NAME"
            echo -e "${YELLOW}Using project name: $PROJECT_NAME (use --name to override)${NC}"
        fi
    fi

    # Prompt for ticket code if not provided
    if [ -z "$TICKET_CODE" ]; then
        # Default to first 2-4 uppercase letters of project name
        DEFAULT_CODE=$(echo "$PROJECT_NAME" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z' | head -c 4)
        if [ ${#DEFAULT_CODE} -lt 2 ]; then
            DEFAULT_CODE="TASK"
        fi
        if [ -t 0 ]; then
            # Interactive mode - prompt user
            read -p "Ticket code prefix [$DEFAULT_CODE]: " TICKET_CODE
            TICKET_CODE="${TICKET_CODE:-$DEFAULT_CODE}"
        else
            # Non-interactive mode (piped) - use default
            TICKET_CODE="$DEFAULT_CODE"
            echo -e "${YELLOW}Using ticket code: $TICKET_CODE (use --code to override)${NC}"
        fi
    fi

    # Validate ticket code (uppercase letters only, 2-6 chars)
    TICKET_CODE=$(echo "$TICKET_CODE" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z')
    if [ ${#TICKET_CODE} -lt 2 ] || [ ${#TICKET_CODE} -gt 6 ]; then
        echo -e "${YELLOW}Warning: Ticket code should be 2-6 uppercase letters. Using 'TASK'.${NC}"
        TICKET_CODE="TASK"
    fi

    echo ""
    echo -e "Project: ${GREEN}$PROJECT_NAME${NC}"
    echo -e "Tickets: ${GREEN}$TICKET_CODE-0001, $TICKET_CODE-0002, ...${NC}"
    echo ""

    # Check if .gitboard already exists
    if [ -d "$TARGET/.gitboard" ]; then
        echo -e "${YELLOW}Warning: .gitboard/ already exists at target${NC}"
        read -p "Overwrite existing installation? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Installation cancelled${NC}"
            exit 1
        fi
        rm -rf "$TARGET/.gitboard"
    fi
fi

# Step 1: Build the app
echo -e "${BLUE}Step 1: Building GitBoard...${NC}"
cd "$SCRIPT_DIR"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "  Installing dependencies..."
    npm install --silent
fi

echo -e "  Running build..."
npm run build --silent

# Verify build output
if [ ! -d ".next/standalone" ]; then
    echo -e "${RED}Error: Build failed - standalone output not found${NC}"
    exit 1
fi

echo -e "  ${GREEN}Build complete${NC}"

# Step 2: Create .gitboard structure
echo -e "${BLUE}Step 2: Creating .gitboard directory structure...${NC}"
mkdir -p "$TARGET/.gitboard/app"
mkdir -p "$TARGET/.gitboard/data"

# Step 3: Copy standalone build
echo -e "${BLUE}Step 3: Copying app files...${NC}"

# Copy standalone server and node_modules (using /. to include hidden files like .next and .env)
cp -r .next/standalone/. "$TARGET/.gitboard/app/"

# Copy static files (required for Next.js) - standalone doesn't include these
mkdir -p "$TARGET/.gitboard/app/.next/static"
cp -r .next/static/. "$TARGET/.gitboard/app/.next/static/"

# Copy server.cjs (custom server with Socket.IO)
cp server.cjs "$TARGET/.gitboard/app/"

# Copy .env file
cp .env "$TARGET/.gitboard/app/" 2>/dev/null || echo "  (no .env file to copy)"

# Copy additional dependencies needed by server.cjs (not included in standalone)
echo -e "  Copying server dependencies..."
DEPS_TO_COPY=(
    "socket.io"
    "socket.io-adapter"
    "socket.io-parser"
    "engine.io"
    "engine.io-parser"
    "ws"
    "cors"
    "vary"
    "object-assign"
    "base64id"
    "@socket.io"
    "simple-git"
    "@kwsites"
    "debug"
    "ms"
    "@homebridge"
    "accepts"
    "negotiator"
    "mime-types"
    "mime-db"
    "cookie"
    "@libsql"
    "libsql"
    "@mastra"
)

for dep in "${DEPS_TO_COPY[@]}"; do
    if [ -d "node_modules/$dep" ]; then
        cp -r "node_modules/$dep" "$TARGET/.gitboard/app/node_modules/" 2>/dev/null || true
    fi
done

echo -e "  ${GREEN}App files copied${NC}"

# Step 4: Initialize data directory (skip in update mode)
if [ "$UPDATE_MODE" = true ]; then
    echo -e "${BLUE}Step 4: Skipping data initialization (update mode)${NC}"
    echo -e "  ${GREEN}Existing data preserved${NC}"
else
    echo -e "${BLUE}Step 4: Initializing data directory...${NC}"
    node "$SCRIPT_DIR/scripts/init-data.js" "$TARGET/.gitboard/data" "$PROJECT_NAME" "$TICKET_CODE"
    echo -e "  ${GREEN}Data initialized${NC}"
fi

# Step 5: Set up Claude Code hooks
echo -e "${BLUE}Step 5: Setting up Claude Code hooks...${NC}"
"$SCRIPT_DIR/scripts/setup-hooks.sh" "$TARGET"

# Step 6: Handle .gitignore
echo -e "${BLUE}Step 6: Configuring git tracking...${NC}"
if [ "$MODE" = "--personal" ]; then
    # Add to .gitignore
    if [ -f "$TARGET/.gitignore" ]; then
        # Check if already in .gitignore
        if ! grep -q "^\.gitboard/$" "$TARGET/.gitignore"; then
            echo ".gitboard/" >> "$TARGET/.gitignore"
            echo -e "  ${GREEN}Added .gitboard/ to .gitignore${NC}"
        else
            echo -e "  .gitboard/ already in .gitignore"
        fi
    else
        echo ".gitboard/" > "$TARGET/.gitignore"
        echo -e "  ${GREEN}Created .gitignore with .gitboard/${NC}"
    fi
else
    # Shared mode - ensure .gitboard is NOT in .gitignore
    if [ -f "$TARGET/.gitignore" ]; then
        if grep -q "^\.gitboard/$" "$TARGET/.gitignore"; then
            # Remove .gitboard/ from .gitignore
            sed -i '' '/^\.gitboard\/$/d' "$TARGET/.gitignore" 2>/dev/null || \
            sed -i '/^\.gitboard\/$/d' "$TARGET/.gitignore"
            echo -e "  ${GREEN}Removed .gitboard/ from .gitignore${NC}"
        fi
    fi
    echo -e "  ${GREEN}.gitboard/ will be tracked by git${NC}"
fi

# Step 7: Create README
echo -e "${BLUE}Step 7: Creating README...${NC}"
cat > "$TARGET/.gitboard/README.md" << 'EOF'
# GitBoard

Git-native project management for AI-assisted teams.

## Starting GitBoard

```bash
cd .gitboard/app
node server.cjs
```

Then open http://localhost:4567 in your browser.

## Directory Structure

```
.gitboard/
├── app/      # GitBoard application (Next.js standalone build)
└── data/     # Your project data
    ├── boards/      # Kanban boards
    ├── agents/      # AI agent configurations
    ├── docs/        # Documentation pages
    ├── config.json  # Project configuration
    └── team.json    # Team members
```

## Switching between Shared and Personal mode

- **Shared (team tool)**: Remove `.gitboard/` from `.gitignore`
- **Personal (individual tool)**: Add `.gitboard/` to `.gitignore`

## Learn More

- Project: https://github.com/anthropics/git-board
EOF
echo -e "  ${GREEN}README created${NC}"

# Done!
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}       Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "To start GitBoard:"
echo -e "  ${BLUE}cd $TARGET/.gitboard/app${NC}"
echo -e "  ${BLUE}node server.cjs${NC}"
echo ""
echo -e "Then open ${BLUE}http://localhost:4567${NC} in your browser."
echo ""
