#!/bin/bash
#
# GitBoard Claude Code Hooks Setup Script
# Sets up Claude Code hooks for GitBoard integration
#
# Usage: ./scripts/setup-hooks.sh /path/to/target-project
#
# This script will:
# - Create hook scripts if they don't exist
# - Merge GitBoard hooks into existing settings.json (won't overwrite other hooks)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
TARGET="$1"

if [ -z "$TARGET" ]; then
    echo -e "${RED}Error: Target directory is required${NC}"
    echo ""
    echo "Usage: $0 /path/to/target-project"
    exit 1
fi

# Resolve target to absolute path
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || {
    echo -e "${RED}Error: Target directory does not exist: $TARGET${NC}"
    exit 1
}

echo -e "${BLUE}Setting up Claude Code hooks...${NC}"

# Create .claude/hooks directory
mkdir -p "$TARGET/.claude/hooks"

# Function to create hook script if it doesn't exist
create_hook_if_missing() {
    local hook_file="$1"
    local hook_name="$2"
    local status="$3"

    if [ -f "$hook_file" ]; then
        echo -e "  ${YELLOW}Skipped $hook_name (already exists)${NC}"
        return
    fi

    cat > "$hook_file" << HOOK_EOF
#!/bin/bash
# Hook script: Notify server when Claude $hook_name
# This is called by Claude Code hooks

PREFIX="[$hook_name]"

# Validate required environment variables
if [ -z "\$GITBOARD_TICKET_ID" ]; then
    echo "\$PREFIX ERROR: GITBOARD_TICKET_ID environment variable is not set" >&2
fi

if [ -z "\$GITBOARD_SERVER_URL" ]; then
    echo "\$PREFIX ERROR: GITBOARD_SERVER_URL environment variable is not set" >&2
fi

if [ -n "\$GITBOARD_TICKET_ID" ] && [ -n "\$GITBOARD_SERVER_URL" ]; then
    echo "\$PREFIX Sending '$status' status for ticket: \$GITBOARD_TICKET_ID to \$GITBOARD_SERVER_URL"

    # Make curl request and capture both response and HTTP status code
    HTTP_RESPONSE=\$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "\${GITBOARD_SERVER_URL}/api/session-status-internal" \\
        -H "Content-Type: application/json" \\
        -d "{\"ticketId\": \"\$GITBOARD_TICKET_ID\", \"status\": \"$status\"}" 2>&1)

    CURL_EXIT_CODE=\$?

    # Extract HTTP status code from response
    HTTP_STATUS=\$(echo "\$HTTP_RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    HTTP_BODY=\$(echo "\$HTTP_RESPONSE" | sed '/HTTP_STATUS:/d')

    if [ \$CURL_EXIT_CODE -ne 0 ]; then
        echo "\$PREFIX ERROR: curl request failed with exit code \$CURL_EXIT_CODE" >&2
        echo "\$PREFIX ERROR: Response: \$HTTP_RESPONSE" >&2
    elif [ -n "\$HTTP_STATUS" ] && [ "\$HTTP_STATUS" -ge 400 ]; then
        echo "\$PREFIX ERROR: HTTP request failed with status \$HTTP_STATUS" >&2
        echo "\$PREFIX ERROR: Response body: \$HTTP_BODY" >&2
    else
        echo "\$PREFIX SUCCESS: Status updated (HTTP \$HTTP_STATUS)"
    fi
fi
HOOK_EOF

    chmod +x "$hook_file"
    echo -e "  ${GREEN}Created $hook_name${NC}"
}

# Create hook scripts if they don't exist
create_hook_if_missing "$TARGET/.claude/hooks/notify-running.sh" "notify-running.sh" "running"
create_hook_if_missing "$TARGET/.claude/hooks/notify-waiting.sh" "notify-waiting.sh" "waiting"
create_hook_if_missing "$TARGET/.claude/hooks/notify-paused.sh" "notify-paused.sh" "paused"
create_hook_if_missing "$TARGET/.claude/hooks/notify-error.sh" "notify-error.sh" "error"

# Handle settings.json - merge if exists, create if not
SETTINGS_FILE="$TARGET/.claude/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
    echo -e "  ${YELLOW}Merging hooks into existing settings.json...${NC}"

    # Use Node.js to merge the settings
    node -e "
const fs = require('fs');

// Read existing settings
let settings;
try {
    settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
} catch (e) {
    settings = {};
}

// Ensure hooks object exists
if (!settings.hooks) {
    settings.hooks = {};
}

// GitBoard hook definitions
const gitboardHooks = {
    UserPromptSubmit: {
        hooks: [{ type: 'command', command: '.claude/hooks/notify-running.sh' }]
    },
    Notification: {
        matcher: 'permission_prompt',
        hooks: [{ type: 'command', command: '.claude/hooks/notify-waiting.sh' }]
    },
    PostToolUse: {
        matcher: '*',
        hooks: [{ type: 'command', command: '.claude/hooks/notify-running.sh' }]
    },
    PostToolUseFailure: {
        matcher: '*',
        hooks: [{ type: 'command', command: '.claude/hooks/notify-error.sh' }]
    },
    Stop: {
        matcher: '',
        hooks: [{ type: 'command', command: '.claude/hooks/notify-paused.sh' }]
    }
};

// Merge each hook type
for (const [hookType, newHook] of Object.entries(gitboardHooks)) {
    if (!settings.hooks[hookType]) {
        settings.hooks[hookType] = [];
    }

    // Check if GitBoard hook already exists (by command path)
    const gitboardCommand = newHook.hooks[0].command;
    const exists = settings.hooks[hookType].some(h =>
        h.hooks && h.hooks.some(hook => hook.command === gitboardCommand)
    );

    if (!exists) {
        settings.hooks[hookType].push(newHook);
        console.log('  Added ' + hookType + ' hook');
    } else {
        console.log('  Skipped ' + hookType + ' hook (already exists)');
    }
}

// Write updated settings
fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
console.log('  Merged settings.json');
"
else
    # Create new settings.json
    cat > "$SETTINGS_FILE" << 'EOF'
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/notify-running.sh"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/notify-waiting.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/notify-running.sh"
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/notify-error.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/notify-paused.sh"
          }
        ]
      }
    ]
  }
}
EOF
    echo -e "  ${GREEN}Created settings.json${NC}"
fi

echo -e "${GREEN}Claude Code hooks setup complete!${NC}"
