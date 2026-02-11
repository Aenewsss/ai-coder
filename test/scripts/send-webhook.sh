#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
API_URL="${API_URL:-http://localhost:3000}"
PAYLOAD_FILE=""

# Function to display usage
usage() {
    echo -e "${BLUE}Usage: $0 [PAYLOAD_FILE]${NC}"
    echo ""
    echo "Send a webhook request to the AI Coder API"
    echo ""
    echo "Arguments:"
    echo "  PAYLOAD_FILE    Path to the JSON payload file (optional)"
    echo "                  If not provided, lists available payloads"
    echo ""
    echo "Environment Variables:"
    echo "  API_URL         Base URL of the API (default: http://localhost:3000)"
    echo ""
    echo "Examples:"
    echo "  $0 test/payloads/simple-task.json"
    echo "  API_URL=https://api.example.com $0 test/payloads/high-priority-task.json"
    echo ""
}

# Function to list available payloads
list_payloads() {
    echo -e "${BLUE}Available test payloads:${NC}"
    echo ""

    local i=1
    for file in test/payloads/*.json; do
        if [ -f "$file" ]; then
            echo -e "${YELLOW}[$i]${NC} $file"
            i=$((i+1))
        fi
    done

    echo ""
    echo -e "${BLUE}Usage:${NC} $0 [PAYLOAD_FILE]"
    echo "Example: $0 test/payloads/simple-task.json"
}

# Parse arguments
if [ $# -eq 0 ]; then
    list_payloads
    exit 0
fi

if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    usage
    exit 0
fi

PAYLOAD_FILE="$1"

# Check if payload file exists
if [ ! -f "$PAYLOAD_FILE" ]; then
    echo -e "${RED}Error: Payload file not found: $PAYLOAD_FILE${NC}"
    echo ""
    list_payloads
    exit 1
fi

# Display request info
echo -e "${BLUE}Sending webhook request...${NC}"
echo -e "API URL: ${YELLOW}$API_URL/webhook${NC}"
echo -e "Payload: ${YELLOW}$PAYLOAD_FILE${NC}"
echo ""

# Send the request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d @"$PAYLOAD_FILE" \
    "$API_URL/webhook")

# Extract HTTP status code and response body
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Display response
echo -e "${BLUE}Response:${NC}"
echo -e "Status Code: ${YELLOW}$HTTP_CODE${NC}"
echo ""

if [ "$HTTP_CODE" -eq 202 ]; then
    echo -e "${GREEN}✓ Webhook accepted${NC}"
    echo ""
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

    # Extract job ID if available
    JOB_ID=$(echo "$BODY" | jq -r '.jobId' 2>/dev/null)
    if [ ! -z "$JOB_ID" ] && [ "$JOB_ID" != "null" ]; then
        echo ""
        echo -e "${BLUE}Track your job:${NC}"
        echo -e "  Status URL: ${YELLOW}$API_URL/jobs/$JOB_ID${NC}"
        echo -e "  Command: ${YELLOW}curl $API_URL/jobs/$JOB_ID${NC}"
        echo ""
        echo -e "${BLUE}Monitor job in real-time:${NC}"
        echo -e "  ${YELLOW}npm run test:monitor $JOB_ID${NC}"
    fi
elif [ "$HTTP_CODE" -eq 400 ]; then
    echo -e "${RED}✗ Validation failed${NC}"
    echo ""
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo -e "${RED}✗ Request failed${NC}"
    echo ""
    echo "$BODY"
fi

echo ""
