#!/bin/bash
# MTI 备考助手 - 后端部署脚本
set -e

APP_DIR="/opt/mti-assistant/backend"
VENV_DIR="$APP_DIR/venv"
SRC_DIR="${SRC_DIR:-/tmp/mti-backend}"
RUN_USER="${RUN_USER:-root}"

if [ ! -d "$SRC_DIR" ]; then
  echo "Source directory not found: $SRC_DIR"
  exit 1
fi

echo "========================================="
echo "  MTI 备考助手 - 后端部署"
echo "========================================="

# Create app directory
mkdir -p "$APP_DIR"

# Copy application files
echo "[1/4] 复制应用文件..."
cp -r "$SRC_DIR"/* "$APP_DIR/"

# Create virtual environment
echo "[2/4] 创建 Python 虚拟环境..."
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --upgrade pip -q
pip install -r "$APP_DIR/requirements.txt" -q

# Copy .env
echo "[3/4] 配置环境变量..."
if [ -f "$SRC_DIR/.env" ]; then
  cp "$SRC_DIR/.env" "$APP_DIR/.env"
else
  echo "No .env in source dir, keep existing env file."
fi

# Setup systemd service
echo "[4/4] 配置 systemd 服务..."
cat > /etc/systemd/system/mti-api.service << EOF
[Unit]
Description=MTI Assistant API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=PATH=$VENV_DIR/bin
ExecStart=$VENV_DIR/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mti-api
systemctl restart mti-api

echo ""
echo "========================================="
echo "  ✅ 后端部署完成！"
echo "  API: http://localhost:8000"
echo "  Docs: http://localhost:8000/docs"
echo "========================================="
