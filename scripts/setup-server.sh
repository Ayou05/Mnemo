#!/bin/bash
# MTI 备考助手 - 宝塔机部署脚本
# 在 106.53.10.184 上执行

set -e

echo "========================================="
echo "  MTI 备考助手 - 服务器环境初始化"
echo "========================================="

# 1. Install PostgreSQL
echo "[1/5] 安装 PostgreSQL..."
if ! command -v psql &> /dev/null; then
    # Install PostgreSQL 16
    dnf install -y postgresql16-server postgresql16-contrib 2>/dev/null || \
    yum install -y postgresql16-server postgresql16-contrib 2>/dev/null || \
    (echo "尝试通过官方源安装..." && \
     dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %{rhel})-x86_64/pgdg-redhat-repo-latest.noarch.rpm && \
     dnf install -y postgresql16-server postgresql16-contrib)
    
    # Initialize
    postgresql-16-setup initdb 2>/dev/null || true
    systemctl enable postgresql-16
    systemctl start postgresql-16
fi
echo "PostgreSQL 版本: $(psql --version)"

# 2. Install Redis
echo "[2/5] 安装 Redis..."
if ! command -v redis-server &> /dev/null; then
    dnf install -y redis 2>/dev/null || yum install -y redis 2>/dev/null || \
    (echo "尝试编译安装..." && \
     yum install -y gcc make && \
     curl -fsSL https://github.com/redis/redis/archive/refs/tags/7.2.4.tar.gz | tar xz && \
     cd redis-7.2.4 && make -j$(nproc) && make install && cd .. && rm -rf redis-7.2.4)
    
    systemctl enable redis
    systemctl start redis
fi
echo "Redis 版本: $(redis-server --version)"

# 3. Setup PostgreSQL database and user
echo "[3/5] 配置数据库..."
sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='mti_user'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER mti_user WITH PASSWORD 'MTI_Secure_2026!';"
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='mti_assistant'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE mti_assistant OWNER mti_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mti_assistant TO mti_user;"
echo "数据库配置完成"

# 4. Configure PostgreSQL to accept connections
echo "[4/5] 配置 PostgreSQL 远程访问..."
PG_HBA="/var/lib/pgsql/16/data/pg_hba.conf"
PG_CONF="/var/lib/pgsql/16/data/postgresql.conf"
if [ -f "$PG_HBA" ]; then
    if ! grep -q "0.0.0.0/0" "$PG_HBA"; then
        echo "host  all  all  0.0.0.0/0  md5" >> "$PG_HBA"
    fi
    if ! grep -q "listen_addresses" "$PG_CONF" || grep -q "listen_addresses = 'localhost'" "$PG_CONF"; then
        sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
    fi
    systemctl restart postgresql-16
fi

# 5. Configure Redis
echo "[5/5] 配置 Redis..."
REDIS_CONF="/etc/redis.conf" || "/etc/redis/redis.conf"
if [ -f "$REDIS_CONF" ]; then
    sed -i 's/^# *maxmemory .*/maxmemory 256mb/' "$REDIS_CONF" 2>/dev/null || echo "maxmemory 256mb" >> "$REDIS_CONF"
    sed -i 's/^# *maxmemory-policy .*/maxmemory-policy allkeys-lru/' "$REDIS_CONF" 2>/dev/null || echo "maxmemory-policy allkeys-lru" >> "$REDIS_CONF"
    systemctl restart redis
fi

echo ""
echo "========================================="
echo "  ✅ 环境初始化完成！"
echo "  PostgreSQL: localhost:5432"
echo "  Redis:      localhost:6379"
echo "========================================="
