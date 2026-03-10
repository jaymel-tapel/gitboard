#!/bin/bash
# Hook script: Notify server when Claude is waiting for user input (permission prompt)
# This is called by Claude Code's Notification hook with "permission_prompt" matcher

PREFIX="[notify-waiting.sh]"

# Validate required environment variables
if [ -z "$GITBOARD_TICKET_ID" ]; then
    echo "$PREFIX ERROR: GITBOARD_TICKET_ID environment variable is not set" >&2
fi

if [ -z "$GITBOARD_SERVER_URL" ]; then
    echo "$PREFIX ERROR: GITBOARD_SERVER_URL environment variable is not set" >&2
fi

if [ -n "$GITBOARD_TICKET_ID" ] && [ -n "$GITBOARD_SERVER_URL" ]; then
    echo "$PREFIX Sending 'waiting' status for ticket: $GITBOARD_TICKET_ID to $GITBOARD_SERVER_URL"

    # Make curl request and capture both response and HTTP status code
    HTTP_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${GITBOARD_SERVER_URL}/api/session-status-internal" \
        -H "Content-Type: application/json" \
        -d "{\"ticketId\": \"$GITBOARD_TICKET_ID\", \"status\": \"waiting\"}" 2>&1)

    CURL_EXIT_CODE=$?

    # Extract HTTP status code from response
    HTTP_STATUS=$(echo "$HTTP_RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '/HTTP_STATUS:/d')

    if [ $CURL_EXIT_CODE -ne 0 ]; then
        echo "$PREFIX ERROR: curl request failed with exit code $CURL_EXIT_CODE" >&2
        echo "$PREFIX ERROR: Response: $HTTP_RESPONSE" >&2
    elif [ -n "$HTTP_STATUS" ] && [ "$HTTP_STATUS" -ge 400 ]; then
        echo "$PREFIX ERROR: HTTP request failed with status $HTTP_STATUS" >&2
        echo "$PREFIX ERROR: Response body: $HTTP_BODY" >&2
    else
        echo "$PREFIX SUCCESS: Status updated (HTTP $HTTP_STATUS)"
    fi
fi
