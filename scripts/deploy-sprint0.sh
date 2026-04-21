#!/bin/bash
# Deploy Mnemo Sprint 0 to production server
set -e

KEY_PATH="${KEY_PATH:-}"
HOST="${HOST:-}"
REMOTE_BASE="${REMOTE_BASE:-/opt/mti-assistant}"
LOCAL_BASE="${LOCAL_BASE:-$(cd "$(dirname "$0")/.." && pwd)}"
ALLOW_DB_RESET="${ALLOW_DB_RESET:-0}"

if [ -z "$KEY_PATH" ] || [ -z "$HOST" ]; then
  echo "Missing KEY_PATH or HOST. Example:"
  echo "  KEY_PATH=~/.ssh/id_rsa HOST=1.2.3.4 ./scripts/deploy-sprint0.sh"
  exit 1
fi

echo "=== Mnemo Sprint 0 Deployment ==="

# Upload backend files
echo "[1/4] Uploading backend files..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no root@$HOST "mkdir -p $REMOTE_BASE/backend/app/core $REMOTE_BASE/backend/app/api $REMOTE_BASE/backend/app/models $REMOTE_BASE/backend/app/schemas"

scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_BASE/backend/app/main.py" \
  "$LOCAL_BASE/backend/app/core/config.py" \
  "$LOCAL_BASE/backend/app/core/database.py" \
  "$LOCAL_BASE/backend/app/core/security.py" \
  "$LOCAL_BASE/backend/app/core/response.py" \
  "$LOCAL_BASE/backend/app/core/exceptions.py" \
  root@$HOST:$REMOTE_BASE/backend/app/core/

scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_BASE/backend/app/api/__init__.py" \
  "$LOCAL_BASE/backend/app/api/auth.py" \
  "$LOCAL_BASE/backend/app/api/tasks.py" \
  "$LOCAL_BASE/backend/app/api/memory.py" \
  "$LOCAL_BASE/backend/app/api/courses.py" \
  "$LOCAL_BASE/backend/app/api/schedule.py" \
  "$LOCAL_BASE/backend/app/api/ai.py" \
  root@$HOST:$REMOTE_BASE/backend/app/api/

scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_BASE/backend/app/models/models.py" \
  "$LOCAL_BASE/backend/app/models/__init__.py" \
  root@$HOST:$REMOTE_BASE/backend/app/models/

scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_BASE/backend/app/schemas/schemas.py" \
  "$LOCAL_BASE/backend/app/schemas/__init__.py" \
  root@$HOST:$REMOTE_BASE/backend/app/schemas/

scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_BASE/backend/app/__init__.py" \
  root@$HOST:$REMOTE_BASE/backend/app/

echo "[2/4] Uploading frontend files..."
ssh -i "$KEY_PATH" root@$HOST "rm -rf $REMOTE_BASE/frontend/out/_next"

# Use rsync for frontend
rsync -avz --delete -e "ssh -i $KEY_PATH -o StrictHostKeyChecking=no" \
  "$LOCAL_BASE/frontend/out/" \
  root@$HOST:$REMOTE_BASE/frontend/out/

echo "[3/4] Database step..."
if [ "$ALLOW_DB_RESET" = "1" ]; then
  echo "WARNING: destructive DB reset enabled"
  ssh -i "$KEY_PATH" root@$HOST "sudo -u postgres psql -d mti_assistant -c 'DROP TABLE IF EXISTS daily_checkins, schedule_entries, schedules, course_notes, memory_cards, tasks, users CASCADE;'"
else
  echo "Skip DB reset (set ALLOW_DB_RESET=1 to enable)"
fi

echo "[4/4] Restarting API service..."
ssh -i "$KEY_PATH" root@$HOST "systemctl restart mti-api && sleep 3 && systemctl is-active mti-api"

echo ""
echo "=== Testing ==="
echo -n "API Health: "
ssh -i "$KEY_PATH" root@$HOST "curl -s http://127.0.0.1:8000/health"

echo ""
echo -n "Register: "
ssh -i "$KEY_PATH" root@$HOST "curl -s -X POST http://127.0.0.1:8001/api/v1/auth/register -H 'Content-Type: application/json' -d '{\"username\":\"test\",\"email\":\"test@mnemo.com\",\"password\":\"123456\",\"nickname\":\"测试\"}' | head -c 200"

echo ""
echo -n "Login: "
ssh -i "$KEY_PATH" root@$HOST "curl -s -X POST http://127.0.0.1:8001/api/v1/auth/login -H 'Content-Type: application/json' -d '{\"username\":\"test\",\"password\":\"123456\"}' | head -c 200"

echo ""
echo -n "Frontend: "
ssh -i "$KEY_PATH" root@$HOST "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/"

echo ""
echo "=== Done ==="
