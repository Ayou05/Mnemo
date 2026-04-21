# MTI 备考助手

翻译硕士考研备考辅助系统 — ToDoList / 听课助手 / 记忆大师 / 课表管理

## 项目结构

```
mti-assistant/
├── backend/          # FastAPI 后端
│   ├── app/
│   │   ├── api/      # 路由
│   │   ├── core/     # 配置、安全、依赖
│   │   ├── models/   # 数据库模型
│   │   ├── schemas/  # Pydantic 模型
│   │   ├── services/ # 业务逻辑
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/         # Next.js 前端
│   ├── src/
│   │   ├── app/      # App Router 页面
│   │   ├── components/
│   │   ├── lib/
│   │   └── styles/
│   ├── package.json
│   └── Dockerfile
├── scripts/          # 部署脚本
├── docker-compose.yml
└── .env
```

## 技术栈

- **前端**: Next.js 14 + shadcn/ui + Tailwind CSS
- **后端**: Python FastAPI
- **数据库**: PostgreSQL + Redis
- **AI**: Fun-ASR (DashScope) + Deepseek + Minimax
- **部署**: 腾讯云宝塔面板机 (Nginx 反代)

## 开发

```bash
# 后端
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# 前端
cd frontend
npm install
npm run dev
```

## 部署

```bash
# 在服务器上
docker compose up -d
```
