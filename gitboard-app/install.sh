#!/bin/sh
# =============================================================================
# setup-gitboard.sh - GitBoard Integration Guide & Setup Script
# =============================================================================
#
# DESCRIPTION:
#   Automates the integration of GitBoard into any local git repository.
#   GitBoard is a git-based project management system that stores tickets,
#   docs pages, team configurations, and AI agent definitions as JSON files.
#
# USAGE:
#   ./setup-gitboard.sh [OPTIONS]
#   curl -fsSL <url>/setup-gitboard.sh | sh
#   curl -fsSL <url>/setup-gitboard.sh | sh -s -- --non-interactive
#
# OPTIONS:
#   -h, --help              Show this help message and exit
#   -v, --version           Show version information and exit
#   -n, --non-interactive   Run without prompts (uses defaults)
#   -f, --force             Overwrite existing gitboard/ directory
#   -d, --dry-run           Preview changes without executing them
#   --skip-env              Skip environment variable configuration
#   --no-commit             Skip initial git commit
#   --project-name NAME     Set project name (default: directory name)
#   --project-code CODE     Set ticket prefix code (default: PM)
#   --project-desc DESC     Set project description
#   --author NAME           Set author name for metadata
#
# EXAMPLES:
#   # Interactive setup (asks for project details)
#   ./setup-gitboard.sh
#
#   # Non-interactive with custom settings
#   ./setup-gitboard.sh --non-interactive --project-name "My App" --project-code APP
#
#   # Dry run to preview changes
#   ./setup-gitboard.sh --dry-run
#
# AUTHOR:
#   GitBoard Team
#
# VERSION:
#   1.1.0
#
# LICENSE:
#   MIT License
#
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Script Metadata
# -----------------------------------------------------------------------------
SCRIPT_VERSION="1.1.0"
SCRIPT_NAME="setup-gitboard.sh"

# -----------------------------------------------------------------------------
# Default Configuration
# -----------------------------------------------------------------------------
INTERACTIVE=true
FORCE=false
DRY_RUN=false
SKIP_ENV=false
NO_COMMIT=false
PROJECT_NAME=""
PROJECT_CODE=""
PROJECT_DESC=""
AUTHOR_NAME=""
GITBOARD_DIR="gitboard"

# -----------------------------------------------------------------------------
# Color Support Detection & Output Helpers
# -----------------------------------------------------------------------------
if [ -t 1 ] && [ -n "${TERM:-}" ] && [ "$TERM" != "dumb" ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    DIM='\033[2m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    MAGENTA=''
    CYAN=''
    BOLD=''
    DIM=''
    NC=''
fi

print_header() {
    printf "\n${BOLD}${BLUE}%s${NC}\n" "$1"
    printf "${DIM}%s${NC}\n" "$(echo "$1" | sed 's/./-/g')"
}

print_step() {
    printf "${CYAN}[*]${NC} %s\n" "$1"
}

print_success() {
    printf "${GREEN}[+]${NC} %s\n" "$1"
}

print_warning() {
    printf "${YELLOW}[!]${NC} %s\n" "$1"
}

print_error() {
    printf "${RED}[x]${NC} %s\n" "$1" >&2
}

print_info() {
    printf "${DIM}    %s${NC}\n" "$1"
}

print_dry_run() {
    printf "${MAGENTA}[DRY-RUN]${NC} %s\n" "$1"
}

print_progress() {
    printf "${CYAN}    -> ${NC}%s\n" "$1"
}

# -----------------------------------------------------------------------------
# Help & Version Functions
# -----------------------------------------------------------------------------
show_help() {
    cat << 'HELP_EOF'
GitBoard Setup Script - v1.1.0

DESCRIPTION:
  Automates the integration of GitBoard into any local git repository.
  Creates the required directory structure and configuration files.

USAGE:
  ./setup-gitboard.sh [OPTIONS]

OPTIONS:
  -h, --help              Show this help message and exit
  -v, --version           Show version information and exit
  -n, --non-interactive   Run without prompts (uses defaults)
  -f, --force             Overwrite existing gitboard/ directory
  -d, --dry-run           Preview changes without executing them
  --skip-env              Skip environment variable configuration
  --no-commit             Skip initial git commit
  --project-name NAME     Set project name (default: directory name)
  --project-code CODE     Set ticket prefix code (default: PM)
  --project-desc DESC     Set project description
  --author NAME           Set author name for metadata

EXAMPLES:
  # Interactive setup (asks for project details)
  ./setup-gitboard.sh

  # Non-interactive with all options
  ./setup-gitboard.sh -n --project-name "E-Commerce App" --project-code SHOP --author "John Doe"

  # Dry run to preview changes
  ./setup-gitboard.sh --dry-run

  # Force overwrite existing setup
  ./setup-gitboard.sh --force

TICKET ID FORMAT:
  Tickets are named using the project code: {CODE}-0001, {CODE}-0002, etc.
  Examples:
    - PM-0001    (default, "Project Management")
    - APP-0001   (for app projects)
    - SHOP-0001  (for e-commerce)
    - API-0001   (for API projects)

DIRECTORY STRUCTURE CREATED:
  gitboard/
  ├── .metadata/
  │   └── next-ids.json      # ID tracking for tickets/initiatives
  ├── agents/                # AI agent configurations
  ├── boards/
  │   └── default/           # Default board
  │       ├── board.json     # Board metadata
  │       └── tickets/
  │           ├── todo/      # Pending tickets
  │           ├── doing/     # In-progress tickets
  │           ├── blocked/   # Blocked tickets
  │           └── done/      # Completed tickets
  ├── docs/                  # Project documentation
  ├── config.json            # GitBoard configuration
  └── team.json              # Team member definitions

For more information, visit: https://github.com/gitboard/gitboard
HELP_EOF
}

show_version() {
    printf "%s version %s\n" "$SCRIPT_NAME" "$SCRIPT_VERSION"
}

# -----------------------------------------------------------------------------
# Argument Parsing
# -----------------------------------------------------------------------------
parse_arguments() {
    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--version)
                show_version
                exit 0
                ;;
            -n|--non-interactive)
                INTERACTIVE=false
                shift
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-env)
                SKIP_ENV=true
                shift
                ;;
            --no-commit)
                NO_COMMIT=true
                shift
                ;;
            --project-name)
                if [ -z "${2:-}" ]; then
                    print_error "Error: --project-name requires a value"
                    exit 1
                fi
                PROJECT_NAME="$2"
                shift 2
                ;;
            --project-name=*)
                PROJECT_NAME="${1#*=}"
                shift
                ;;
            --project-code)
                if [ -z "${2:-}" ]; then
                    print_error "Error: --project-code requires a value"
                    exit 1
                fi
                PROJECT_CODE="$2"
                shift 2
                ;;
            --project-code=*)
                PROJECT_CODE="${1#*=}"
                shift
                ;;
            --project-desc)
                if [ -z "${2:-}" ]; then
                    print_error "Error: --project-desc requires a value"
                    exit 1
                fi
                PROJECT_DESC="$2"
                shift 2
                ;;
            --project-desc=*)
                PROJECT_DESC="${1#*=}"
                shift
                ;;
            --author)
                if [ -z "${2:-}" ]; then
                    print_error "Error: --author requires a value"
                    exit 1
                fi
                AUTHOR_NAME="$2"
                shift 2
                ;;
            --author=*)
                AUTHOR_NAME="${1#*=}"
                shift
                ;;
            -*)
                print_error "Unknown option: $1"
                printf "Use --help for usage information\n" >&2
                exit 1
                ;;
            *)
                print_error "Unexpected argument: $1"
                printf "Use --help for usage information\n" >&2
                exit 1
                ;;
        esac
    done
}

# -----------------------------------------------------------------------------
# Prerequisite Checks
# -----------------------------------------------------------------------------
check_prerequisites() {
    print_header "Checking Prerequisites"

    print_step "Checking for git installation..."
    if ! command -v git >/dev/null 2>&1; then
        print_error "Git is not installed or not in PATH"
        print_info "Please install git and try again"
        print_info "  macOS:    brew install git"
        print_info "  Ubuntu:   sudo apt install git"
        print_info "  Windows:  https://git-scm.com/download/win"
        exit 1
    fi
    print_success "Git is installed ($(git --version | head -1))"

    print_step "Checking if current directory is a git repository..."
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        print_error "Current directory is not a git repository"
        print_info "Please run this script from within a git repository, or initialize one:"
        print_info "  git init"
        exit 1
    fi

    REPO_ROOT=$(git rev-parse --show-toplevel)
    print_success "Git repository found: $REPO_ROOT"

    print_step "Checking write permissions..."
    if [ ! -w "$REPO_ROOT" ]; then
        print_error "No write permission in repository directory"
        print_info "Please check your permissions and try again"
        exit 1
    fi
    print_success "Write permissions confirmed"
}

# -----------------------------------------------------------------------------
# Project Configuration (Interactive)
# -----------------------------------------------------------------------------
configure_project() {
    print_header "Project Configuration"

    # Get git user name as default author
    GIT_USER_NAME=$(git config user.name 2>/dev/null || echo "")
    DEFAULT_PROJECT_NAME=$(basename "$REPO_ROOT")

    if [ "$INTERACTIVE" = true ]; then
        # Project Name
        if [ -z "$PROJECT_NAME" ]; then
            printf "\n"
            printf "${BOLD}Project Name${NC}\n"
            printf "${DIM}The display name for your project${NC}\n"
            printf "Enter project name [${CYAN}%s${NC}]: " "$DEFAULT_PROJECT_NAME"
            read -r input_name
            PROJECT_NAME="${input_name:-$DEFAULT_PROJECT_NAME}"
        fi

        # Project Code
        if [ -z "$PROJECT_CODE" ]; then
            printf "\n"
            printf "${BOLD}Project Code (Ticket Prefix)${NC}\n"
            printf "${DIM}Used for ticket IDs like ${CYAN}CODE${NC}${DIM}-0001, ${CYAN}CODE${NC}${DIM}-0002${NC}\n"
            printf "${DIM}Examples: PM, APP, API, SHOP, DEV, FEAT${NC}\n"
            printf "Enter project code [${CYAN}PM${NC}]: "
            read -r input_code
            PROJECT_CODE="${input_code:-PM}"
        fi

        # Validate and uppercase the project code
        PROJECT_CODE=$(echo "$PROJECT_CODE" | tr '[:lower:]' '[:upper:]' | tr -cd '[:alnum:]')
        if [ -z "$PROJECT_CODE" ]; then
            PROJECT_CODE="PM"
        fi

        # Project Description
        if [ -z "$PROJECT_DESC" ]; then
            printf "\n"
            printf "${BOLD}Project Description${NC}\n"
            printf "${DIM}A brief description of your project (optional)${NC}\n"
            printf "Enter description: "
            read -r input_desc
            PROJECT_DESC="${input_desc:-A project managed with GitBoard}"
        fi

        # Author Name
        if [ -z "$AUTHOR_NAME" ]; then
            printf "\n"
            printf "${BOLD}Your Name${NC}\n"
            printf "${DIM}Used for 'created_by' in tickets and docs pages${NC}\n"
            if [ -n "$GIT_USER_NAME" ]; then
                printf "Enter your name [${CYAN}%s${NC}]: " "$GIT_USER_NAME"
            else
                printf "Enter your name: "
            fi
            read -r input_author
            AUTHOR_NAME="${input_author:-$GIT_USER_NAME}"
        fi

        # Confirmation
        printf "\n"
        printf "${BOLD}${CYAN}Configuration Summary${NC}\n"
        printf "  Project Name:  ${GREEN}%s${NC}\n" "$PROJECT_NAME"
        printf "  Project Code:  ${GREEN}%s${NC} (tickets: %s-0001, %s-0002, ...)\n" "$PROJECT_CODE" "$PROJECT_CODE" "$PROJECT_CODE"
        printf "  Description:   ${GREEN}%s${NC}\n" "$PROJECT_DESC"
        printf "  Author:        ${GREEN}%s${NC}\n" "$AUTHOR_NAME"
        printf "\n"
        printf "Proceed with this configuration? [Y/n]: "
        read -r confirm
        if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
            print_info "Setup cancelled. Run again to reconfigure."
            exit 0
        fi

    else
        # Non-interactive: use defaults
        if [ -z "$PROJECT_NAME" ]; then
            PROJECT_NAME="$DEFAULT_PROJECT_NAME"
        fi
        if [ -z "$PROJECT_CODE" ]; then
            PROJECT_CODE="PM"
        fi
        PROJECT_CODE=$(echo "$PROJECT_CODE" | tr '[:lower:]' '[:upper:]' | tr -cd '[:alnum:]')
        if [ -z "$PROJECT_DESC" ]; then
            PROJECT_DESC="A project managed with GitBoard"
        fi
        if [ -z "$AUTHOR_NAME" ]; then
            AUTHOR_NAME="${GIT_USER_NAME:-GitBoard User}"
        fi

        print_info "Project Name: $PROJECT_NAME"
        print_info "Project Code: $PROJECT_CODE"
        print_info "Description: $PROJECT_DESC"
        print_info "Author: $AUTHOR_NAME"
    fi

    print_success "Project configuration complete"
}

# -----------------------------------------------------------------------------
# Idempotency Check
# -----------------------------------------------------------------------------
check_existing_installation() {
    print_header "Checking Existing Installation"

    GITBOARD_PATH="$REPO_ROOT/$GITBOARD_DIR"

    if [ -d "$GITBOARD_PATH" ]; then
        print_warning "GitBoard directory already exists: $GITBOARD_PATH"

        if [ "$FORCE" = true ]; then
            print_warning "Force flag set - will overwrite existing files"
            return 0
        fi

        if [ "$INTERACTIVE" = false ]; then
            print_error "Existing installation found. Use --force to overwrite."
            exit 1
        fi

        printf "\n${YELLOW}An existing gitboard/ directory was found.${NC}\n"
        printf "Would you like to:\n"
        printf "  ${BOLD}1)${NC} Keep existing files and add missing ones only\n"
        printf "  ${BOLD}2)${NC} Overwrite all configuration files\n"
        printf "  ${BOLD}3)${NC} Cancel setup\n"
        printf "\n"
        printf "Enter your choice [1-3]: "
        read -r choice

        case "$choice" in
            1)
                print_info "Will preserve existing files"
                PRESERVE_EXISTING=true
                ;;
            2)
                print_info "Will overwrite configuration files"
                FORCE=true
                PRESERVE_EXISTING=false
                ;;
            3|*)
                print_info "Setup cancelled by user"
                exit 0
                ;;
        esac
    else
        PRESERVE_EXISTING=false
        print_success "No existing GitBoard installation found"
    fi
}

# -----------------------------------------------------------------------------
# Directory Structure Creation
# -----------------------------------------------------------------------------
create_directory_structure() {
    print_header "Creating Directory Structure"

    GITBOARD_PATH="$REPO_ROOT/$GITBOARD_DIR"

    DIRECTORIES="
        $GITBOARD_PATH
        $GITBOARD_PATH/.metadata
        $GITBOARD_PATH/.prompts
        $GITBOARD_PATH/agents
        $GITBOARD_PATH/initiatives
        $GITBOARD_PATH/reports
        $GITBOARD_PATH/boards
        $GITBOARD_PATH/boards/default
        $GITBOARD_PATH/boards/default/tickets
        $GITBOARD_PATH/boards/default/tickets/todo
        $GITBOARD_PATH/boards/default/tickets/doing
        $GITBOARD_PATH/boards/default/tickets/blocked
        $GITBOARD_PATH/boards/default/tickets/done
        $GITBOARD_PATH/docs
    "

    for dir in $DIRECTORIES; do
        if [ "$DRY_RUN" = true ]; then
            if [ ! -d "$dir" ]; then
                print_dry_run "Would create: $dir"
            else
                print_info "Already exists: $dir"
            fi
        else
            if [ ! -d "$dir" ]; then
                mkdir -p "$dir"
                print_progress "Created: ${dir#$REPO_ROOT/}"
            else
                print_info "Already exists: ${dir#$REPO_ROOT/}"
            fi
        fi
    done

    print_success "Directory structure ready"
}

# -----------------------------------------------------------------------------
# Configuration File Generation
# -----------------------------------------------------------------------------
create_config_files() {
    print_header "Creating Configuration Files"

    GITBOARD_PATH="$REPO_ROOT/$GITBOARD_DIR"
    CURRENT_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Create team.json
    TEAM_JSON_PATH="$GITBOARD_PATH/team.json"
    if should_create_file "$TEAM_JSON_PATH"; then
        TEAM_JSON_CONTENT=$(cat << EOF
{
  "team": [],
  "roles": {
    "definitions": [
      {
        "title": "Full-Stack Engineer",
        "levels": ["junior", "mid", "senior", "staff", "principal"],
        "default_areas": ["backend", "frontend"]
      },
      {
        "title": "AI Development Assistant",
        "levels": ["assistant"],
        "default_areas": ["code-generation", "documentation", "architecture"]
      }
    ]
  }
}
EOF
)
        write_file "$TEAM_JSON_PATH" "$TEAM_JSON_CONTENT"
    fi

    # Create .metadata/next-ids.json with project code
    NEXT_IDS_PATH="$GITBOARD_PATH/.metadata/next-ids.json"
    if should_create_file "$NEXT_IDS_PATH"; then
        NEXT_IDS_CONTENT=$(cat << EOF
{
  "ticket_prefix": "$PROJECT_CODE",
  "next_ticket_id": 1,
  "next_initiative_id": 1,
  "schema_version": "1.0"
}
EOF
)
        write_file "$NEXT_IDS_PATH" "$NEXT_IDS_CONTENT"
    fi

    # Create config.json with all project settings
    CONFIG_JSON_PATH="$GITBOARD_PATH/config.json"
    if should_create_file "$CONFIG_JSON_PATH"; then
        CONFIG_JSON_CONTENT=$(cat << EOF
{
  "version": "1.0",
  "project": {
    "name": "$PROJECT_NAME",
    "code": "$PROJECT_CODE",
    "description": "$PROJECT_DESC"
  },
  "settings": {
    "auto_commit": true,
    "commit_prefix": "[gitboard]",
    "ticket_prefix": "$PROJECT_CODE",
    "next_ticket_id": 1,
    "next_initiative_id": 1
  },
  "ai": {
    "enabled": true,
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022"
  },
  "metadata": {
    "created_at": "$CURRENT_DATE",
    "created_by": "$AUTHOR_NAME"
  }
}
EOF
)
        write_file "$CONFIG_JSON_PATH" "$CONFIG_JSON_CONTENT"
    fi

    # Create default board metadata
    BOARD_JSON_PATH="$GITBOARD_PATH/boards/default/board.json"
    if should_create_file "$BOARD_JSON_PATH"; then
        BOARD_JSON_CONTENT=$(cat << EOF
{
  "id": "default",
  "name": "$PROJECT_NAME",
  "ticket_prefix": "$PROJECT_CODE",
  "next_ticket_id": 1,
  "created_at": "$CURRENT_DATE"
}
EOF
)
        write_file "$BOARD_JSON_PATH" "$BOARD_JSON_CONTENT"
    fi

    # Create .locks.json
    LOCKS_JSON_PATH="$GITBOARD_PATH/.locks.json"
    if should_create_file "$LOCKS_JSON_PATH"; then
        write_file "$LOCKS_JSON_PATH" '[]'
    fi

    # Create changelog.md
    CHANGELOG_PATH="$GITBOARD_PATH/changelog.md"
    if should_create_file "$CHANGELOG_PATH"; then
        CHANGELOG_DATE=$(date +%Y-%m-%d)
        CHANGELOG_CONTENT=$(cat << EOF
# $PROJECT_NAME Changelog

## [$CHANGELOG_DATE] - Initial Setup

### Added
- Initialized GitBoard project management structure
- Created default board with ticket workflow directories (todo, doing, blocked, done)
- Set up team configuration
- Configured ticket prefix: $PROJECT_CODE

---

*This changelog is auto-managed by GitBoard. Manual edits are welcome.*
EOF
)
        write_file "$CHANGELOG_PATH" "$CHANGELOG_CONTENT"
    fi

    print_success "Configuration files ready"
}

should_create_file() {
    filepath="$1"
    if [ -f "$filepath" ]; then
        if [ "${PRESERVE_EXISTING:-false}" = true ]; then
            print_info "Preserving existing: ${filepath#$REPO_ROOT/}"
            return 1
        fi
        if [ "$FORCE" = true ]; then
            return 0
        fi
        print_info "Already exists: ${filepath#$REPO_ROOT/}"
        return 1
    fi
    return 0
}

write_file() {
    filepath="$1"
    content="$2"

    if [ "$DRY_RUN" = true ]; then
        print_dry_run "Would create: ${filepath#$REPO_ROOT/}"
    else
        printf '%s\n' "$content" > "$filepath"
        print_progress "Created: ${filepath#$REPO_ROOT/}"
    fi
}

# -----------------------------------------------------------------------------
# Environment Variable Configuration
# -----------------------------------------------------------------------------
configure_environment() {
    if [ "$SKIP_ENV" = true ]; then
        print_info "Skipping environment configuration (--skip-env)"
        return 0
    fi

    print_header "Environment Configuration"

    ENV_EXAMPLE_PATH="$REPO_ROOT/.env.example"
    if [ ! -f "$ENV_EXAMPLE_PATH" ] || [ "$FORCE" = true ]; then
        ENV_EXAMPLE_CONTENT=$(cat << EOF
# =============================================================================
# GitBoard Environment Configuration - $PROJECT_NAME
# =============================================================================
# Copy this file to .env and update the values for your environment.

# Path to the repository containing the gitboard/ directory
GITBOARD_REPO_PATH=$REPO_ROOT

# Port for the GitBoard web UI (default: 3000)
PORT=3000

# Optional: Enable debug logging
# DEBUG=gitboard:*

# Optional: AI Provider Configuration
# ANTHROPIC_API_KEY=your-api-key-here
EOF
)
        if [ "$DRY_RUN" = true ]; then
            print_dry_run "Would create: .env.example"
        else
            printf '%s\n' "$ENV_EXAMPLE_CONTENT" > "$ENV_EXAMPLE_PATH"
            print_progress "Created: .env.example"
        fi
    fi

    if [ "$INTERACTIVE" = true ] && [ "$DRY_RUN" = false ]; then
        printf "\n"
        printf "Would you like to add ${BOLD}GITBOARD_REPO_PATH${NC} to your shell profile?\n"
        printf "Configure shell profile? [y/N]: "
        read -r configure_shell

        if [ "$configure_shell" = "y" ] || [ "$configure_shell" = "Y" ]; then
            configure_shell_profile
        else
            print_info "Skipping shell profile configuration"
        fi
    else
        print_info "Shell profile configuration skipped (non-interactive mode)"
        print_info "To configure manually: export GITBOARD_REPO_PATH=\"$REPO_ROOT\""
    fi
}

configure_shell_profile() {
    SHELL_NAME=$(basename "${SHELL:-/bin/sh}")

    case "$SHELL_NAME" in
        zsh)  PROFILE_FILE="$HOME/.zshrc" ;;
        bash)
            if [ -f "$HOME/.bashrc" ]; then
                PROFILE_FILE="$HOME/.bashrc"
            else
                PROFILE_FILE="$HOME/.bash_profile"
            fi
            ;;
        *)    PROFILE_FILE="$HOME/.profile" ;;
    esac

    print_step "Detected shell: $SHELL_NAME"
    print_step "Profile file: $PROFILE_FILE"

    EXPORT_LINE="export GITBOARD_REPO_PATH=\"$REPO_ROOT\""

    if [ -f "$PROFILE_FILE" ] && grep -q "GITBOARD_REPO_PATH" "$PROFILE_FILE" 2>/dev/null; then
        print_warning "GITBOARD_REPO_PATH already configured in $PROFILE_FILE"
        printf "Update to new path? [y/N]: "
        read -r update_path

        if [ "$update_path" = "y" ] || [ "$update_path" = "Y" ]; then
            cp "$PROFILE_FILE" "$PROFILE_FILE.backup"
            grep -v "GITBOARD_REPO_PATH" "$PROFILE_FILE" > "$PROFILE_FILE.tmp"
            mv "$PROFILE_FILE.tmp" "$PROFILE_FILE"
            printf '\n# GitBoard Repository Path\n%s\n' "$EXPORT_LINE" >> "$PROFILE_FILE"
            print_success "Updated $PROFILE_FILE"
        fi
    else
        printf '\n# GitBoard Repository Path\n%s\n' "$EXPORT_LINE" >> "$PROFILE_FILE"
        print_success "Added GITBOARD_REPO_PATH to $PROFILE_FILE"
    fi

    print_info "Run 'source $PROFILE_FILE' or restart your terminal"
}

# -----------------------------------------------------------------------------
# Git Commit
# -----------------------------------------------------------------------------
create_initial_commit() {
    if [ "$NO_COMMIT" = true ]; then
        print_info "Skipping initial commit (--no-commit)"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        print_dry_run "Would stage and commit gitboard/ directory"
        return 0
    fi

    print_header "Creating Initial Commit"

    cd "$REPO_ROOT"
    git add "$GITBOARD_DIR/" 2>/dev/null || true

    if git diff --cached --quiet 2>/dev/null; then
        print_info "No new changes to commit"
        return 0
    fi

    COMMIT_MSG="[gitboard] Initialize $PROJECT_NAME with GitBoard

Project: $PROJECT_NAME
Code: $PROJECT_CODE (tickets: ${PROJECT_CODE}-0001, ${PROJECT_CODE}-0002, ...)

Created directory structure:
- gitboard/boards/default/tickets/{todo,doing,blocked,done}/
- gitboard/boards/default/board.json
- gitboard/docs/
- gitboard/agents/
- gitboard/.metadata/

Generated by setup-gitboard.sh v$SCRIPT_VERSION"

    if [ "$INTERACTIVE" = true ]; then
        printf "\n"
        printf "Ready to create initial commit. Proceed? [Y/n]: "
        read -r do_commit
        if [ "$do_commit" = "n" ] || [ "$do_commit" = "N" ]; then
            print_info "Skipping commit. Files are staged and ready."
            return 0
        fi
    fi

    git commit -m "$COMMIT_MSG" >/dev/null 2>&1
    print_success "Created initial commit"
    print_info "Commit: $(git rev-parse --short HEAD)"
}

# -----------------------------------------------------------------------------
# Completion Summary
# -----------------------------------------------------------------------------
show_completion_summary() {
    print_header "Setup Complete!"

    if [ "$DRY_RUN" = true ]; then
        printf "\n${MAGENTA}${BOLD}DRY RUN COMPLETE${NC}\n"
        printf "No changes were made. Run without --dry-run to apply changes.\n"
        return 0
    fi

    printf "\n${GREEN}${BOLD}GitBoard has been successfully initialized!${NC}\n"
    printf "\n"

    printf "${BOLD}Project Details:${NC}\n"
    printf "  Name:        ${CYAN}%s${NC}\n" "$PROJECT_NAME"
    printf "  Code:        ${CYAN}%s${NC}\n" "$PROJECT_CODE"
    printf "  Ticket IDs:  ${CYAN}%s-0001${NC}, ${CYAN}%s-0002${NC}, ...\n" "$PROJECT_CODE" "$PROJECT_CODE"
    printf "\n"

    printf "${BOLD}Created Resources:${NC}\n"
    printf "  ${CYAN}Directories:${NC}\n"
    printf "    - gitboard/boards/default/tickets/{todo,doing,blocked,done}/\n"
    printf "    - gitboard/docs/\n"
    printf "    - gitboard/agents/\n"
    printf "    - gitboard/.metadata/\n"
    printf "\n"
    printf "  ${CYAN}Configuration Files:${NC}\n"
    printf "    - gitboard/config.json\n"
    printf "    - gitboard/team.json\n"
    printf "    - gitboard/boards/default/board.json\n"
    printf "    - gitboard/.metadata/next-ids.json\n"
    printf "    - gitboard/changelog.md\n"
    printf "    - .env.example\n"
    printf "\n"

    printf "${BOLD}Next Steps:${NC}\n"
    printf "\n"
    printf "  ${CYAN}1.${NC} Create your first ticket:\n"
    printf "     ${DIM}Create ${PROJECT_CODE}-0001.json in gitboard/boards/default/tickets/todo/${NC}\n"
    printf "\n"
    printf "  ${CYAN}2.${NC} Add team members to gitboard/team.json\n"
    printf "\n"
    printf "  ${CYAN}3.${NC} Set up your environment:\n"
    printf "     ${DIM}cp .env.example .env${NC}\n"
    printf "\n"

    printf "${BOLD}Quick Reference:${NC}\n"
    printf "  Ticket location:  gitboard/boards/default/tickets/{todo,doing,blocked,done}/\n"
    printf "  Ticket naming:    ${PROJECT_CODE}-XXXX.json\n"
    printf "  Docs pages:       gitboard/docs/\n"
    printf "  AI agents:        gitboard/agents/\n"
    printf "  Board metadata:   gitboard/boards/{board-id}/board.json\n"
    printf "\n"

    printf "${GREEN}Happy project managing with GitBoard!${NC}\n"
    printf "\n"
}

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------
main() {
    parse_arguments "$@"

    printf "\n"
    printf "${BOLD}${BLUE}"
    printf "   _____ _ _   ____                      _ \n"
    printf "  / ____(_) | |  _ \\                    | |\n"
    printf " | |  __ _| |_| |_) | ___   __ _ _ __ __| |\n"
    printf " | | |_ | | __|  _ < / _ \\ / _\` | '__/ _\` |\n"
    printf " | |__| | | |_| |_) | (_) | (_| | | | (_| |\n"
    printf "  \\_____|_|\\__|____/ \\___/ \\__,_|_|  \\__,_|\n"
    printf "${NC}\n"
    printf "  ${DIM}Git-Native Project Management v%s${NC}\n" "$SCRIPT_VERSION"
    printf "\n"

    if [ "$DRY_RUN" = true ]; then
        printf "${MAGENTA}${BOLD}[DRY RUN MODE]${NC} No changes will be made\n"
    fi

    check_prerequisites
    configure_project
    check_existing_installation
    create_directory_structure
    create_config_files
    configure_environment
    create_initial_commit
    show_completion_summary
}

main "$@"
