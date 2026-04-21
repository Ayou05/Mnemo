# Mnemo 白皮书全量需求映射与差异清单

本文件用于把白皮书目标映射到当前代码，实现“可追踪开发”。

## 1) 白皮书条目 -> 代码模块映射

| 白皮书条目 | 代码位置 | 当前状态 | 备注 |
|---|---|---|---|
| 任务管理（CRUD/分类/统计/打卡） | `backend/app/api/tasks.py`, `frontend/src/app/tasks/page.tsx` | 已实现 | 统计字段与 Dashboard 仍有契约差异 |
| 记忆卡片 CRUD + 复习队列 + SM-2 | `backend/app/api/memory.py`, `frontend/src/app/memory/page.tsx` | 已实现 | 具备基础复习与统计 |
| CASR 行为信号调度 | `backend/app/core/casr.py`, `backend/app/api/memory.py` | 已实现 | 已记录 encounter 日志 |
| 材料导入（Excel/Word/Text） | `backend/app/api/import_cards.py`, `frontend/src/app/memory/page.tsx` | Sprint 7 已推进 | Excel/Word 已按白皮书补齐预览+确认；Text/CSV 支持分隔符预览确认 |
| 卡片集 Deck/CardSet | `backend/app/models/models.py`(CardSet), `backend/app/api/import_cards.py` | Sprint 7 已推进 | 已补齐 `/memory/decks` 白皮书 API；后续接 Sprint 8 训练入口 |
| 听课助手（笔记+AI） | `backend/app/api/courses.py`, `backend/app/api/ai.py`, `frontend/src/app/courses/page.tsx` | Sprint 11 已推进 | 笔记/问答已实现，桌面录课桥接入口已接入 Tauri 占位捕获与转写触发 |
| 课表（CRUD/冲突/导入导出） | `backend/app/api/schedule.py`, `frontend/src/app/schedule/page.tsx` | 已实现 | .xlsx 与 csv 接口能力描述需统一 |
| Dashboard 学习驾驶舱 | `frontend/src/app/dashboard/page.tsx`, `backend/app/api/tasks.py`, `backend/app/api/memory.py` | Sprint 10 已推进 | 已对齐任务统计字段，并接入记忆统计、今日复习、长期记忆进度与近 7 天趋势 |
| 移动端适配（底部导航） | `frontend/src/components/layout/app-layout.tsx` | Sprint 10 已推进 | 已使用 `md:ml-64` 与移动端底部导航，后续继续优化训练输入细节 |
| 设置系统 | `frontend/src/app/settings/page.tsx`, `frontend/src/stores/settings.ts` | Sprint 14 已推进 | 已支持主题/语言/训练偏好/提醒时间与静默时段，新增数据管理入口（备份导出与导入恢复） |
| 错题本 + 回流复习 | `backend/app/api/memory.py`, `frontend/src/app/memory/page.tsx` | Sprint 9 已推进 | 判错入错题、错题优先复习、单组通过后清出错题本已形成基础闭环 |
| 任务计划模板联动（机构上交） | `backend/app/api/tasks.py`, `frontend/src/app/tasks/page.tsx`, `backend/app/models/models.py` | Sprint 14 已推进 | 已支持 docx 导入、按 ToDo 自动回填、历史锁定、xlsx 导出、手工补充、导出前校验与上交版导出 |
| 全局搜索（任务/记忆/笔记/课表） | `backend/app/api/system.py`, `frontend/src/app/tasks/page.tsx` | Sprint 14 已推进 | 任务页提供全局搜索与任务定位；备份导入统一在设置「数据管理」，避免重复入口 |
| 全量数据导出（JSON 备份） | `backend/app/api/system.py` | Sprint 14 已推进 | 已提供 `/system/data/export/all`，覆盖任务/记忆/笔记/课表/计划模板 |
| 全量数据导入恢复（Dry-run + Apply） | `backend/app/api/system.py`, `frontend/src/app/tasks/page.tsx` | Sprint 14 已推进 | 已提供 `/system/data/import/all`，默认预检，确认后执行追加导入并返回统计 |
| 备份版本兼容校验与按月替换导入 | `backend/app/api/system.py`, `frontend/src/app/tasks/page.tsx` | Sprint 14 已推进 | 导入已校验 `version=v1`，并支持 `template_mode=replace_by_month` 防止计划模板重复 |
| 备份导入冲突预检报告 | `backend/app/api/system.py`, `frontend/src/app/tasks/page.tsx` | Sprint 14 已推进 | dry-run 返回重复任务标题/重复模板月份与风险等级，导入前可视化提示 |
| 桌面端听课链路（Tauri） | `desktop/src-tauri/src/lib.rs`, `frontend/src/app/courses/page.tsx` | Sprint 11 已推进 | 已提供 start/status/stop/trigger_transcription 命令与前端桥接 UI；后续替换为真实系统音频采集与 ASR |
| AI 监督背诵（ASR 卡顿检测 + TTS 提示） | `desktop/src-tauri`, `backend/app/api/ai.py`, `frontend/src/app/memory/page.tsx` | 后续方向 | 参考背书匠：ASR 识别停顿/卡壳，按时机给渐进提示，并通过 TTS 播报 |

## 2) 核心差异清单（必须优先清算）

1. Sprint 8 训练“多模式”文档完整，但代码目前仍主要是 CASR 翻卡/输入混合流。
2. Sprint 9 错题本已形成“训练判错 -> 错题 -> 复习策略错题优先 -> 通过后清出”的基础闭环；后续需补错题原因、错因标签和错题统计图。
3. Dashboard 学习驾驶舱已接入任务与记忆统计；后续需继续补课程学习时长、课表今日课程和跨模块目标完成度。
4. 移动端一期布局已落地；后续需继续优化记忆训练输入、弹窗和长列表的触屏体验。
5. 听课助手已具备桌面端音频捕获占位与转写触发命令；后续需接入真实系统音频采集、ASR 流式转写和失败恢复。
6. 文本粘贴 AI 拆分已补本地解析兜底；后续需继续优化复杂段落/表格的语义切分质量。
7. AI 监督背诵尚未进入 MVP：需要先沉淀 ASR 流式识别、卡顿判定、提示等级和 TTS 播报策略，再接入记忆大师训练流。
8. 任务计划模板联动已形成 MVP；后续需继续做模板版式高保真导出、字段多栏位映射和变更审计。

## 3) 落地顺序（与执行待办一致）

1. **两周核心闭环**：导入统一、输入型训练、错题本、复习回流、统计补齐。
2. **契约对齐**：前后端关键接口字段统一，保证 Dashboard 与训练页稳定。
3. **移动端一期**：底部导航 + 训练输入体验优先。
4. **桌面端最小链路**：提供 Tauri 可调用的“音频捕获占位 + 转写触发”命令，打通接口与状态流。
5. **AI 监督背诵后续方向**：在听课/训练音频链路稳定后，追加 ASR 卡顿检测、渐进提示和 TTS 播报，形成背诵监督闭环。
