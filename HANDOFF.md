# Mnemo — 项目交接文档

> 最后更新：2026-04-22 14:30
> 作者：敲敲（OpenClaw AI Agent）
> 仓库：https://github.com/Ayou05/Mnemo

---

## 一、项目概述

**Mnemo** 是一个面向 MTI（翻译硕士）备考学生的智能学习管理平台。核心定位：**记忆训练 + 练习助手 + 任务管理 + 课表管理 + 听课笔记**，五合一。

### 目标用户
- 翻译专业大三学生，准备 2027 年 MTI 考研
- 已报名：翻译硕士魔法部 2027 全程班、米恩翻译课程
- 当前在广交会实习，时间有限，需要高效备考工具

### 品质标准
- Focat 级上市品质，vibe coding 标准
- 手机端优先（Capacitor 安卓），桌面端次之（Tauri）
- 前端已部署为静态站，通过 Nginx 反向代理到后端

---

## 二、技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| **前端框架** | Next.js (Static Export) | 16.2.4 |
| **UI 库** | shadcn/ui + Tailwind CSS v4 | — |
| **状态管理** | Zustand | 5.0.12 |
| **HTTP 客户端** | 原生 fetch 封装 (api.ts) | — |
| **图表** | Recharts | 3.8.1 |
| **国际化** | 自建 i18n (zh/en) | — |
| **后端框架** | FastAPI | 0.115.0 |
| **数据库** | PostgreSQL + asyncpg | — |
| **缓存** | Redis | 5.0.8 |
| **ORM** | SQLAlchemy 2.0 (async) | 2.0.35 |
| **迁移** | Alembic | 1.13.0 |
| **认证** | JWT (python-jose) | — |
| **LLM** | DeepSeek (文本)、DashScope/通义千问 (ASR)、MiniMax (记忆分析) | — |
| **部署** | 腾讯云 + 宝塔面板 + Nginx + systemd | — |

---

## 三、服务器信息

| 服务器 | IP | 用途 |
|---|---|---|
| **宝塔面板机** | 106.53.10.184 | 前端静态站 + 后端 API + PostgreSQL + Redis |
| **纯 Ubuntu 机** | 119.91.117.90 | 备用 |

### 部署架构
```
用户浏览器
    ↓
Nginx (106.53.10.184:80/443)
    ├── /           → 前端静态文件 (Next.js export → /var/www/mti/)
    └── /api/v1/*   → 反向代理 → uvicorn :8000 (systemd mti-api.service)
                              ↓
                        FastAPI + PostgreSQL + Redis
```

### 关键端口
- 前端：80 (Nginx)
- 后端 API：8000 (仅本地/SSH 隧道可访问)
- PostgreSQL：5432
- Redis：6379

### 数据库凭据
- 用户：`mti_user`
- 密码：`MTI_Secure_2026!`
- 数据库名：`mti_assistant`
- 连接串：`postgresql+asyncpg://mti_user:MTI_Secure_2026!@localhost:5432/mti_assistant`

### 环境变量 (后端 .env)
```
DATABASE_URL=postgresql+asyncpg://mti_user:MTI_Secure_2026!@localhost:5432/mti_assistant
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=mnemo_jwt_secret_2026_change_in_prod
DASHSCOPE_API_KEY=<百炼 API Key>
DEEPSEEK_API_KEY=<DeepSeek API Key>
MINIMAX_API_KEY=<MiniMax API Key>
```

### 部署命令
```bash
# 后端
cd /opt/mti-assistant/backend
source venv/bin/activate
pip install -r requirements.txt
systemctl restart mti-api

# 前端
cd frontend
npm run build   # 输出到 out/
# 将 out/ 内容复制到 /var/www/mti/
```

---

## 四、项目文件结构

```
mti-assistant/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI 入口，lifespan 自动建表
│   │   ├── api/
│   │   │   ├── __init__.py            # 路由注册（所有 router 在这里挂载）
│   │   │   ├── auth.py                # 认证：注册/登录/JWT/设置同步
│   │   │   ├── tasks.py               # 任务 CRUD + 打卡 + 统计
│   │   │   ├── plan_template.py       # 机构计划表模板管理
│   │   │   ├── memory.py              # 记忆训练：卡片 CRUD + CASR 复习 + 错题本
│   │   │   ├── import_cards.py        # 卡片批量导入（文本/JSON/CSV）
│   │   │   ├── practice.py            # 练习助手：AI 生成题目 + 做题 + AI 辅导
│   │   │   ├── courses.py             # 听课助手：笔记 CRUD + AI 笔记生成
│   │   │   ├── schedule.py            # 课表 CRUD + 冲突检测
│   │   │   ├── schedule_import.py     # 课表 OCR 导入（图片→LLM→结构化）
│   │   │   ├── ai.py                  # 通用 AI 接口（聊天/翻译/总结）
│   │   │   └── system.py              # 系统能力查询（ASR/TTS/VLM 可用性）
│   │   ├── core/
│   │   │   ├── config.py              # Pydantic Settings（环境变量）
│   │   │   ├── database.py            # SQLAlchemy async engine + session
│   │   │   ├── security.py            # JWT 编解码 + passlib hash
│   │   │   ├── response.py            # 统一响应格式 ApiResponse
│   │   │   ├── exceptions.py          # 全局异常处理
│   │   │   ├── casr.py                # CASR 间隔复习算法（核心！）
│   │   │   └── evaluation.py          # 答案评估 + 错因分类 + AI 诊断
│   │   ├── models/
│   │   │   └── models.py              # 所有 SQLAlchemy 模型（10 张表）
│   │   ├── schemas/
│   │   │   └── schemas.py             # Pydantic 请求/响应 schema
│   │   └── tests/
│   │       └── test_casr.py           # CASR 单元测试
│   ├── alembic/
│   │   ├── env.py                     # Alembic 配置
│   │   └── versions/                  # 迁移文件
│   ├── requirements.txt               # Python 依赖
│   └── .env                           # 环境变量（不提交 git）
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx             # 根布局（主题 + Toaster + SW）
│   │   │   ├── globals.css            # 全局样式 + Tailwind
│   │   │   ├── login/page.tsx         # 登录页
│   │   │   ├── dashboard/page.tsx     # 仪表盘（概览 + 统计）
│   │   │   ├── tasks/
│   │   │   │   ├── page.tsx           # 任务管理主页（691 行）
│   │   │   │   └── components/
│   │   │   │       └── index.tsx      # TaskCard/CheckinCalendar/WeekView/MonthNav
│   │   │   ├── memory/
│   │   │   │   └── page.tsx           # 记忆训练（2354 行，最大文件）
│   │   │   ├── practice/
│   │   │   │   ├── page.tsx           # 练习助手主页（105 行薄壳）
│   │   │   │   ├── lib/
│   │   │   │   │   └── data.ts        # 类型 + 常量 + sessionStorage + GOAL_PROMPTS
│   │   │   │   └── components/
│   │   │   │       ├── chat-view.tsx  # AI 对话出题 + 错题上下文
│   │   │   │       ├── quiz-view.tsx  # 做题界面 + 每题 AI 辅导对话
│   │   │   │       └── sheets.tsx     # 错题本 + 历史记录
│   │   │   ├── schedule/page.tsx      # 课表管理（966 行）
│   │   │   ├── courses/page.tsx       # 听课助手（701 行）
│   │   │   └── settings/page.tsx      # 设置页
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── app-layout.tsx    # 主布局（侧边栏 + 底部导航）
│   │   │   │   └── sidebar.tsx       # 侧边栏
│   │   │   ├── goal-picker.tsx        # 备考目标选择器（80+ 考试）
│   │   │   ├── ui/                    # shadcn/ui 组件
│   │   │   │   ├── button.tsx, card.tsx, input.tsx, dialog.tsx, badge.tsx...
│   │   │   │   ├── empty-state.tsx, error-state.tsx, skeleton.tsx
│   │   │   │   ├── celebrations.tsx   # Confetti 动画
│   │   │   │   └── timed-countdown.tsx
│   │   │   └── providers/
│   │   │       └── theme-provider.tsx # 暗色模式
│   │   ├── lib/
│   │   │   ├── api.ts                 # HTTP 客户端（fetch 封装 + JWT + 401 重定向）
│   │   │   ├── i18n.ts                # 国际化 hook
│   │   │   ├── utils.ts               # cn() 工具函数
│   │   │   ├── memory-types.tsx       # 记忆模块类型 + 常量 + 组件
│   │   │   ├── task-types.ts          # 任务模块类型 + 工具函数
│   │   │   └── notifications.ts       # 推送通知逻辑
│   │   ├── stores/
│   │   │   ├── auth.ts                # 认证状态（localStorage 持久化）
│   │   │   ├── settings.ts            # 设置状态（服务端同步）
│   │   │   └── locale.ts              # 语言状态
│   │   ├── i18n/
│   │   │   ├── zh.json                # 中文翻译
│   │   │   └── en.json                # 英文翻译
│   │   └── types/
│   │       └── index.ts               # 全局类型
│   ├── public/
│   │   ├── sw.js                      # Service Worker (mnemo-v1)
│   │   ├── manifest.json              # PWA manifest
│   │   └── icons/                     # PWA 图标
│   ├── next.config.ts                 # output: "export"（静态导出）
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.local                     # NEXT_PUBLIC_API_URL=/api/v1
│
├── mobile/
│   └── capacitor.config.json          # Capacitor 安卓配置
│
├── scripts/
│   ├── deploy-backend.sh              # 后端部署脚本
│   ├── deploy-sprint0.sh              # 初始部署脚本
│   └── setup-server.sh                # 服务器初始化
│
├── .github/workflows/ci.yml           # GitHub Actions CI
└── README.md
```

---

## 五、数据库模型（10 张表）

| 表名 | 用途 | 关键字段 |
|---|---|---|
| `users` | 用户 | username, email, hashed_password, settings(JSONB), locale |
| `tasks` | 任务 | title, description, due_date, priority, status, tags(JSON), subtasks(JSON), is_pinned |
| `checkin_records` | 打卡 | task_id, date, note |
| `memory_cards` | 记忆卡片 | source_text, target_text, source_lang, target_lang, domain, difficulty, card_type, card_set_id, confidence, next_review, review_count, wrong_count, last_wrong_reason, last_wrong_detail |
| `card_sets` | 卡片组 | name, description, card_count |
| `practice_sets` | 练习集 | title, source, source_ref, question_count |
| `practice_questions` | 练习题目 | question_text, options(JSON), answer, explanation, question_type, category, topic, difficulty, confidence, next_review, review_count, wrong_count, last_wrong_reason |
| `practice_answers` | 做题记录 | question_id, session_id, user_answer, is_correct, wrong_reason, think_time_ms, confidence_before/after |
| `schedule_entries` | 课表条目 | title, day_of_week, start_time, end_time, location, color, event_date(可为NULL=周循环) |
| `course_notes` | 课程笔记 | course_id, title, raw_transcript, cleaned_text, structured_notes, summary |

### 关系
- User → Tasks (1:N), MemoryCards (1:N), PracticeQuestions (1:N), PracticeAnswers (1:N), ScheduleEntries (1:N), CourseNotes (1:N)
- CardSet → MemoryCards (1:N)
- PracticeSet → PracticeQuestions (1:N)
- PracticeQuestion → PracticeAnswers (1:N)

---

## 六、API 路由总览

所有路由前缀：`/api/v1`

### 认证 `/auth`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /register | 注册 |
| POST | /login | 登录，返回 JWT |
| GET | /me | 获取当前用户信息 |
| GET | /settings | 获取用户设置 (JSONB) |
| PUT | /settings | 更新用户设置 (merge) |

### 任务 `/tasks`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | / | 任务列表（支持筛选/排序/分页） |
| POST | / | 创建任务 |
| PUT | /{id} | 更新任务 |
| DELETE | /{id} | 删除任务 |
| POST | /{id}/toggle | 切换完成状态 |
| POST | /{id}/pin | 切换置顶 |
| GET | /stats | 任务统计 |
| GET | /checkins | 打卡记录 |
| POST | /checkins | 提交打卡 |
| GET | /plan-templates | 计划模板列表 |
| POST | /plan-templates | 创建计划模板 |
| PUT | /plan-templates/{id} | 更新计划模板 |
| DELETE | /plan-templates/{id} | 删除计划模板 |

### 记忆训练 `/memory`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | / | 卡片列表（分页/筛选/排序） |
| POST | / | 创建卡片 |
| PUT | /{id} | 更新卡片 |
| DELETE | /{id} | 删除卡片 |
| GET | /sets | 卡片组列表 |
| POST | /sets | 创建卡片组 |
| GET | /stats | 记忆统计 |
| POST | /review | 提交复习结果（CASR 处理） |
| GET | /casr/queue | 获取 CASR 复习队列 |
| POST | /diagnose | AI 错因诊断 |
| GET | /recommend-mode | AI 推荐复习模式 |
| GET | /wrongbook | 错题本 |
| POST | /import | 批量导入卡片 |
| GET | /session-summary | 训练会话摘要 |

### 练习助手 `/practice`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /generate | AI 生成练习题（自然语言→题目） |
| GET | /sets | 练习集列表 |
| GET | /sets/{id}/questions | 获取题目列表 |
| POST | /answer | 提交答案（自动批改 + CASR 更新） |
| POST | /explain | AI 解析单题 |
| **POST** | **/tutor** | **AI 多轮辅导（题目上下文 + 错题上下文）** |
| GET | /stats | 练习统计 |
| GET | /history | 练习历史 |
| GET | /wrong | 错题列表 |

### 课表 `/schedule`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | / | 获取当前课表 |
| POST | / | 创建/更新课表 |
| POST | /entries | 添加条目 |
| PUT | /entries/{id} | 更新条目 |
| DELETE | /entries/{id} | 删除条目 |
| GET | /conflicts | 冲突检测 |
| GET | /conflicts/advise | AI 冲突建议 |
| POST | /import | OCR 导入课表（图片→LLM） |

### 听课助手 `/courses`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /notes | 笔记列表 |
| POST | /notes | 创建笔记 |
| PUT | /notes/{id} | 更新笔记 |
| DELETE | /notes/{id} | 删除笔记 |
| POST | /notes/{id}/clean | AI 清洗转写文本 |
| POST | /notes/{id}/generate | AI 生成结构化笔记 |
| POST | /chat | AI 私教问答 |

### AI `/ai`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /chat | 通用 AI 对话 |
| POST | /translate | 翻译 |
| POST | /summarize | 总结 |

### 系统 `/system`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /capabilities | 系统能力（ASR/TTS/VLM 是否可用） |

---

## 七、核心算法：CASR

**CASR (Confidence-Adaptive Spaced Repetition)** 是记忆模块的核心调度算法。

### 原理
基于行为信号（反应时间、翻转次数）+ 用户自评（forgot/fuzzy/remembered）计算置信度，再根据置信度决定下次复习时间。

### 置信度计算
```
delta = RESULT_DELTA[user_judgment]  # forgot:-20, fuzzy:+5, remembered:+12
delta += THINK_TIME_PENALTY           # >10s:-12, >5s:-6, >3s:-3
delta += FLIP_PENALTY                 # 3+次:-8, 2次:-4
delta += VERIFY_TIME_PENALTY          # >5s:-5
new_confidence = EMA(old_confidence, delta)  # alpha=0.3
```

### 复习间隔
| 置信度 | 间隔 |
|---|---|
| 0-15 | 10 分钟 |
| 16-30 | 1 小时 |
| 31-45 | 4 小时 |
| 46-60 | 1 天 |
| 61-75 | 3 天 |
| 76-85 | 7 天 |
| 86-95 | 14 天 |
| 96-100 | 30 天 |

### 展示模式（evolution_mode）
| 置信度 | 模式 | 说明 |
|---|---|---|
| <25 | hint | 双面展示（答案直接可见） |
| 25-50 | standard | 标准翻转 |
| 50-75 | timed | 5 秒自动翻转 |
| >75 | flash | 1.5 秒闪现 |

### 错因分类（9 种）
`mismatch` | `partial_match` | `missing_content` | `spelling` | `word_order` | `omission` | `confusion` | `grammar` | `forgot`

---

## 八、前端架构要点

### API 客户端 (`lib/api.ts`)
- 基于 `fetch` 封装，不是 axios
- 自动附加 JWT Bearer token
- 401 自动跳转 `/login`
- 30 秒超时
- 后端返回格式：`{ code: 0, message: "ok", data: {...} }`
- 前端 `api.get()` 直接返回 `data` 字段

### 状态管理
- **auth.ts**: 用户认证，localStorage 持久化 token
- **settings.ts**: 用户设置，**服务端同步**（hydrate 从服务器加载，_sync fire-and-forget 写回）
  - 踩坑：SQLAlchemy 不检测 JSONB 字段变更，需要 `flag_modified(user, "settings")`
- **locale.ts**: 语言切换

### 国际化
- 自建 i18n，不是 next-intl（虽然装了但没用）
- 翻译文件：`i18n/zh.json`, `i18n/en.json`
- 使用方式：`const { t } = useTranslation(); t("memory.title")`

### Service Worker
- 版本：`mnemo-v1`（⚠️ 需要升级到 `mnemo-v3` 或更高，否则用户可能看到旧缓存）
- 路径：`public/sw.js`

### 静态导出
- `next.config.ts`: `output: "export"`
- 构建输出到 `out/` 目录
- 没有 SSR/SSG，所有页面都是客户端渲染

### 导航
- 侧边栏（桌面）+ 底部 Tab 栏（手机）
- 6 个主页面：Dashboard、Tasks、Memory、Practice、Schedule、Settings
- 路由：`/dashboard`, `/tasks`, `/memory`, `/practice`, `/schedule`, `/settings`

---

## 九、已完成功能清单

### ✅ Phase 1：基础架构
- [x] FastAPI 后端 + PostgreSQL + Redis
- [x] JWT 认证（注册/登录/设置同步）
- [x] Next.js 前端 + shadcn/ui + Tailwind
- [x] 部署到腾讯云（Nginx + systemd）

### ✅ Phase 2：任务管理
- [x] 任务 CRUD + 优先级 + 标签 + 子任务
- [x] 打卡日历 + 统计
- [x] 机构计划表模板（同步/手工补充）
- [x] 周视图 + 列表视图

### ✅ Phase 3：记忆训练
- [x] 双语记忆卡片（英中/中英）
- [x] CASR 间隔复习算法
- [x] 5 种训练模式（标准翻转/英中/中英/挖空/段落默写）
- [x] 错因细化（9 种错因 + 颜色编码）
- [x] AI 错因诊断（LLM 分析错误原因）
- [x] 难度自动评估 + 动态调整
- [x] 智能模式推荐（错因感知）
- [x] 批量导入卡片（文本/JSON/CSV）
- [x] 卡片组管理
- [x] 错题本
- [x] 游戏化（连击/分数/里程碑动画）
- [x] 群组训练（5/10/15/20 题一组）

### ✅ Phase 4：练习助手
- [x] AI 对话式生成题目（自然语言→LLM→结构化题目）
- [x] 做题界面（选择题/填空题/翻译题/写作题）
- [x] 即时批改 + CASR 置信度追踪
- [x] 错题本 + 练习历史
- [x] 做题计时 + 键盘快捷键
- [x] **全程 AI 辅导**（做题时每题可多轮追问 + 做完后继续讨论）
- [x] 目标驱动推荐（专四/专八/四六级/考研/雅思/托福/MTI/GRE）

### ✅ Phase 5：课表管理
- [x] 课表 CRUD + 周循环 + 一次性事件
- [x] OCR 导入（图片→LLM→结构化课表）
- [x] 冲突检测 + AI 冲突建议
- [x] 周视图 + 列表视图

### ✅ Phase 6：听课助手
- [x] 课程笔记 CRUD
- [x] AI 清洗转写文本
- [x] AI 生成结构化笔记
- [x] AI 私教问答

### ✅ Phase 7：打磨
- [x] 代码拆分（tasks 拆出 components，practice 重建为多文件）
- [x] 备考目标选择器（80+ 考试分类）
- [x] 设置页（复习模式/提醒/安静时段/备考目标）
- [x] 暗色模式
- [x] PWA 支持（manifest + SW）

---

## 十、未完成 / 待做事项

### 🔴 高优先级
1. **Service Worker 版本升级**：当前 `mnemo-v1`，需改为 `mnemo-v3+`，否则用户可能看到旧缓存
2. **部署今天所有改动**：practice 模块重建 + 全程 AI 辅导 + tasks 拆分
3. **memory/page.tsx 拆分**：2354 行，状态高度耦合，需要仔细拆分（建议拆成 hook + 6 个 UI 组件）

### 🟡 中优先级
4. **学习记录 Tab 升级**：LLM 每日摘要 + 周报生成
5. **任务智能规划**：LLM 根据备考目标自动拆分每日任务
6. **PDF 题册导入**：PyMuPDF + VLM OCR 解析（练习模块最后一块拼图）
7. **桌面端 Tauri 集成**
8. **安卓端 Capacitor 打包**

### 🟢 低优先级
9. **memory/page.tsx 2354 行拆分**（功能正常，只是代码量大）
10. **schedule/page.tsx 966 行拆分**
11. **courses/page.tsx 701 行拆分**
12. **全局搜索**（已删除，可能需要重新设计）
13. **数据导出**（卡片/任务/练习记录导出为 Excel/PDF）

---

## 十一、已知问题 & 踩坑记录

### Service Worker 缓存
- **问题**：用户看到"网络错误"但后端日志正常
- **原因**：SW 缓存了旧版本的前端
- **解决**：升级 SW 缓存版本，用户需 `Ctrl+Shift+R` 强制刷新
- **当前状态**：SW 版本仍为 `mnemo-v1`，需升级

### LLM 生成超时
- **问题**：generate 接口可能超过 30s
- **解决**：前端用 raw fetch + 90s 超时，不走 api client 的 30s

### passlib hash 不兼容
- **问题**：登录 500 错误
- **原因**：passlib 和 bcrypt 版本不兼容
- **解决**：统一使用 `passlib[bcrypt]`

### SQLAlchemy JSONB 变更检测
- **问题**：修改 User.settings 后不写回数据库
- **原因**：SQLAlchemy 不检测 JSONB 字段变更
- **解决**：`from sqlalchemy.orm.attributes import flag_modified; flag_modified(user, "settings")`

### Next.js Static Export
- **问题**：不能用 SSR/SSG/API Routes
- **原因**：`output: "export"` 模式
- **影响**：所有 API 调用必须走外部后端，不能在 Next.js 里写 API Route

### 前端 API_BASE
- 开发环境：`NEXT_PUBLIC_API_URL=/api/v1`（通过 Nginx 代理）
- 生产环境：同上（Nginx 反向代理到 8000 端口）

---

## 十二、关键设计决策

### 为什么用 CASR 而不是 SM-2？
- SM-2 只用用户自评（容易/困难），信号单一
- CASR 结合行为信号（反应时间、翻转次数、确认时间），更准确
- 有学术论文支撑（Nelson 1984, Wiertelak 2025, Bjork 2020）

### 为什么用对话式生成而不是表单？
- 让用户填"考点/题型/难度"表单是反人性的
- 自然语言输入更自然："出10道虚拟语气选择题"
- LLM 可以从自然语言推断题型/难度/数量

### 为什么 settings 要服务端同步？
- 用户换设备需要同步
- localStorage 只在本地，不可靠
- 方案：hydrate 从服务器加载，_sync fire-and-forget 写回

### 为什么 practice 模块要全程 AI 辅导？
- 生成题目 → 做题 → 看个笼统解析 → 结束，这种体验太浅
- 用户需要能随时追问"为什么错""这个知识点还能怎么考"
- 做完题退回聊天后，AI 应该带着错题上下文继续讨论

---

## 十三、LLM API 使用情况

| 服务商 | 用途 | 模型 | 接口 |
|---|---|---|---|
| **DeepSeek** | 文本生成（练习题、笔记、辅导、诊断） | deepseek-chat | https://api.deepseek.com/chat/completions |
| **DashScope/通义千问** | ASR 语音转写 | paraformer-realtime-v2 | 百炼 API |
| **MiniMax** | 记忆卡片文本分析、闪卡生成 | abab6.5s-chat | MiniMax API |

### DeepSeek 调用模式
```python
# 所有 LLM 调用统一模式
async with httpx.AsyncClient(timeout=30) as client:
    resp = await client.post(
        "https://api.deepseek.com/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {_settings.DEEPSEEK_API_KEY}",
        },
        json={
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,  # 生成题用 0.3，辅导用 0.4
        },
    )
    result = resp.json()
    content = result["choices"][0]["message"]["content"].strip()
```

---

## 十四、Git 状态

当前有大量未提交的改动（今天的工作）：

**已修改文件（M）：**
- `backend/app/api/__init__.py` — 新增 practice router 注册
- `backend/app/api/auth.py` — 新增 settings API
- `backend/app/api/import_cards.py` — 导入优化
- `backend/app/api/memory.py` — 错因细化 + AI 诊断 + 模式推荐
- `backend/app/api/schedule.py` — event_date 支持
- `backend/app/api/tasks.py` — 打卡 + 统计
- `backend/app/models/models.py` — 新表 + 字段
- `backend/app/schemas/schemas.py` — 新 schema
- `frontend/src/app/memory/page.tsx` — 错因 UI + 模式推荐 + 游戏化
- `frontend/src/app/schedule/page.tsx` — 列表视图 + event_date
- `frontend/src/app/settings/page.tsx` — 新设置项
- `frontend/src/app/tasks/page.tsx` — 拆分后（691 行）
- `frontend/src/components/layout/app-layout.tsx` — 导航更新
- `frontend/src/i18n/en.json` — 新翻译
- `frontend/src/i18n/zh.json` — 新翻译
- `frontend/src/lib/api.ts` — 优化
- `frontend/src/stores/settings.ts` — 服务端同步

**新增文件（??）：**
- `backend/alembic/versions/20260422_0001_memory_card_last_wrong_detail.py`
- `backend/app/api/plan_template.py` — 计划模板
- `backend/app/api/practice.py` — 练习助手（含 AI 辅导）
- `backend/app/api/schedule_import.py` — 课表 OCR 导入
- `backend/app/core/evaluation.py` — 答案评估 + 错因分类
- `frontend/src/app/practice/` — 练习助手（全部重建）
- `frontend/src/app/tasks/components/` — 任务子组件
- `frontend/src/components/goal-picker.tsx` — 备考目标选择器
- `frontend/src/lib/memory-types.tsx` — 记忆模块类型
- `frontend/src/lib/task-types.ts` — 任务模块类型

---

## 十五、版本保护

当前稳定版已打 tag `v0.9-stable`，**绝对不要删除这个 tag**。

新 agent 应该在 main 分支上继续开发。如果改崩了，用以下命令回退：

```bash
git checkout main
git reset --hard v0.9-stable
git push --force origin main
```

建议新 agent 每次做较大改动前先打一个临时 tag（如 `v0.9-wip-xxx`），方便回退。

---

## 十六、给下一个 AI Agent 的建议

### 优先做这些
1. **先 git commit + push 所有改动**，确保代码安全
2. **部署今天的改动**（practice 模块 + tasks 拆分）
3. **升级 Service Worker 版本**到 `mnemo-v3`
4. **体验练习模块的全程 AI 辅导流程**，看有没有 bug

### 然后按这个顺序
5. 学习记录 Tab + LLM 周报
6. 任务智能规划
7. PDF 题册导入
8. memory/page.tsx 拆分（2354 行）
9. 桌面端/安卓端

### 注意事项
- 后端 API 端口 8001 仅服务器本地可访问，前端通过 Nginx `/api/v1` 代理
- 修改 User.settings 后必须 `flag_modified(user, "settings")`
- 前端是 static export，不能用 API Routes
- DeepSeek API 有速率限制，生成题目时注意控制并发
- CASR 算法在 `backend/app/core/casr.py`，修改前务必理解其原理
- `memory/page.tsx` 虽然大但功能稳定，拆分时务必小心，建议先写测试

---

## 十六、用户偏好

- 语言：中文为主，英文为辅
- 风格：直接、务实、不喜欢废话
- 沟通：给方案让用户选，不要问太多"你要不要"
- 代码：实用主义，小改动 > 大重构
- 部署：先部署再打磨，不要憋大招
- AI 名字：敲敲
