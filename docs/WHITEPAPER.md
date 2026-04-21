# Mnemo — 产品白皮书

> **版本**: v0.1.0-draft  
> **更新日期**: 2026-04-20  
> **产品定位**: 通用记忆训练 + 学习管理平台  
> **目标品质**: 独立开发 vibe coding 上市级（对齐 Focat、Anki、滴答清单）

---

## 目录

- [1. 产品概述](#1-产品概述)
- [2. 用户画像](#2-用户画像)
- [3. 核心功能模块](#3-核心功能模块)
- [4. 产品设计规范](#4-产品设计规范)
- [5. 技术架构](#5-技术架构)
- [6. 数据模型](#6-数据模型)
- [7. AI 服务集成](#7-ai-服务集成)
- [8. 跨平台策略](#8-跨平台策略)
- [9. 安全与隐私](#9-安全与隐私)
- [10. 部署架构](#10-部署架构)
- [11. 开发路线图](#11-开发路线图)
- [12. 版本更新日志](#12-版本更新日志)

---

## 1. 产品概述

### 1.1 产品名称

**Mnemo** — 取自希腊记忆女神 Mnemosyne（摩涅莫绪涅），简洁、国际化、易于记忆。

### 1.2 一句话描述

Mnemo 是一款面向考研学生的智能学习管理平台，核心提供**双语对照记忆训练**、**任务管理**、**听课笔记**和**课表管理**四大功能，帮助用户高效备考。

### 1.3 核心差异化

| 差异点 | 市面产品 | Mnemo |
|--------|---------|-------|
| 记忆卡片 | 单语卡片，先记A面再记B面 | **双语对照卡片**，支持中英同时训练 |
| 训练模式 | 翻卡 + 选择题 | **8 种训练模式**（对照/填空/翻译/配对/选择/拼写/限时/听写） |
| 填空方式 | 固定挖空 | **智能挖空**（按词性/长度/频率自动选择关键词） |
| 听课辅助 | 无 | **系统音频实时捕获 + AI 笔记生成** |
| 学习管理 | 独立工具 | **四模块联动**（课表→任务→记忆→听课） |
| 多领域 | 通用或单一领域 | **用户自定义领域**（翻译/历史/法律/医学…） |

### 1.4 目标平台

| 平台 | 优先级 | 功能完整度 |
|------|--------|-----------|
| **桌面端** (Windows/macOS/Linux) | P0 — 主力平台 | 100%（含听课助手） |
| **Web 端** | P1 — 补充访问 | 90%（无系统音频捕获） |
| **安卓端** | P2 — 移动补充 | 70%（无听课助手） |

---

## 2. 用户画像

### 2.1 主要用户

**用户 A — 翻译专业考研学生**
- 身份：翻译专业大三学生
- 目标：通过 MTI 翻译硕士考研
- 已报名课程：翻译硕士魔法部 2027 全程班、米恩翻译课程
- 当前状态：广交会实习中，时间有限
- 核心需求：
  - 中英对照文本记忆（政治/经济/科技/文化翻译术语）
  - 听课笔记自动生成（小鹅通/钉钉直播课）
  - 时间管理（实习 + 备考平衡）
- 技术水平：普通用户，需要直观易用的界面

**用户 B — 历史学师范考研学生**
- 身份：历史学师范专业学生
- 目标：通过研究生考试
- 核心需求：
  - 中文历史名词记忆（中国古代史/世界近代史）
  - 教育学原理知识点记忆
  - 考研政治/英语学习
- 与用户 A 的差异：不需要听课助手，不需要双语对照，但需要大量中文文本记忆

### 2.2 用户场景

```
场景 1：每日学习规划
  早上打开 Mnemo → 查看今日任务 → 看到课表提醒有直播课
  → 调整任务优先级 → 开始执行

场景 2：听课 + 笔记
  打开小鹅通直播课 → Mnemo 自动捕获音频 → 实时转写
  → 课程结束后 AI 生成结构化笔记 → 标记重点

场景 3：记忆训练
  打开记忆大师 → 看到今日待复习 30 张卡片
  → 选择"英→中填空"模式 → 完成 20 张
  → 切换到"对照阅读"模式 → 复习新卡片 10 张
  → 查看学习统计

场景 4：考前冲刺
  导入魔法部冲刺资料 → AI 自动拆分为卡片
  → 限时挑战模式 → 查看薄弱领域
  → 针对性复习
```

---

## 3. 核心功能模块

### 3.1 模块总览

```
┌─────────────────────────────────────────────────────┐
│                      Mnemo                          │
├──────────┬──────────┬──────────┬───────────────────┤
│ 任务管理  │ 记忆大师  │ 听课助手  │    课表管理       │
│ ToDoList │ Memory   │ Lecture  │   Schedule        │
├──────────┼──────────┼──────────┼───────────────────┤
│ ·任务CRUD │ ·卡片CRUD │ ·音频捕获 │ ·课表上传        │
│ ·分类标签 │ ·双语对照 │ ·实时转写 │ ·OCR解析         │
│ ·子任务   │ ·8种训练  │ ·笔记生成 │ ·冲突检测         │
│ ·打卡统计 │ ·SM-2算法 │ ·私教问答 │ ·周视图          │
│ ·多维视图 │ ·AI生成   │ ·笔记管理 │ ·联动任务         │
│ ·智能排期 │ ·学习统计 │ ·导出     │ ·课程提醒         │
└──────────┴──────────┴──────────┴───────────────────┘
```

### 3.2 模块一：任务管理 (ToDoList)

#### 3.2.1 功能清单

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 任务 CRUD | 创建/读取/更新/删除任务 | P0 |
| 任务分类 | 自定义分类（名称 + 颜色 + 图标） | P0 |
| 优先级 | 高/中/低，影响排序和视觉标识 | P0 |
| 标签系统 | 多标签，支持按标签筛选 | P1 |
| 子任务 | 任务内嵌检查清单 | P1 |
| 截止日期 | 日期 + 时间，过期高亮 | P0 |
| 时间块 | 开始时间-结束时间，日视图展示 | P1 |
| 重复任务 | 每日/每周/自定义周期 | P2 |
| 状态流转 | 待办 → 进行中 → 已完成 | P0 |
| 搜索 | 按标题/描述/标签搜索 | P1 |
| 多维筛选 | 按分类/优先级/状态/日期筛选 | P1 |
| 拖拽排序 | 手动调整任务顺序 | P2 |

#### 3.2.2 视图设计

**日视图（默认）**
```
┌─────────────────────────────────────────┐
│  4月20日 周日                    + 新任务  │
├─────────────────────────────────────────┤
│  📅 今日概览                             │
│  ┌──────┐ ┌──────┐ ┌──────┐            │
│  │ 待办  │ │进行中│ │已完成│            │
│  │  5   │ │  2   │ │  8   │            │
│  └──────┘ └──────┘ └──────┘            │
├─────────────────────────────────────────┤
│  🔴 高优先级                              │
│  ☐ 魔法部翻译练习 Day 15        截止 明天 │
│  ☐ 米恩翻译材料背诵            截止 今天 │
├─────────────────────────────────────────┤
│  🟡 中优先级                              │
│  ☑ 政治翻译术语复习 (30min)              │
│  ☐ 经济翻译笔记整理                       │
├─────────────────────────────────────────┤
│  🟢 低优先级                              │
│  ☑ 阅读《翻译研究》第三章                  │
└─────────────────────────────────────────┘
```

**周视图**
```
┌─────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ 周一 │ 周二  │ 周三  │ 周四  │ 周五  │ 周六  │ 周日  │
├─────┼──────┼──────┼──────┼──────┼──────┼──────┤
│ 3/5 │ 2/4  │ 4/6  │ 1/3  │ 2/5  │ 0/0  │ 0/0  │
│     │      │      │      │      │      │      │
│ ☐   │ ☐    │ ☐    │      │ ☐    │      │      │
│ ☐   │ ☑    │ ☐    │ ☐    │      │      │      │
│ ☑   │      │ ☑    │ ☑    │ ☐    │      │      │
└─────┴──────┴──────┴──────┴──────┴──────┴──────┘
```

**看板视图**
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│  待办 (5) │ │进行中 (2) │ │已完成 (8) │
├──────────┤ ├──────────┤ ├──────────┤
│ □ 任务A   │ ▶ 任务D   │ ✓ 任务G   │
│ □ 任务B   │ ▶ 任务E   │ ✓ 任务H   │
│ □ 任务C   │           │ ✓ 任务I   │
│ □ 任务F   │           │ ...       │
└──────────┘ └──────────┘ └──────────┘
```

#### 3.2.3 打卡统计

```
┌─────────────────────────────────────────┐
│  📊 学习统计                             │
├─────────────────────────────────────────┤
│  🔥 连续打卡 12 天                       │
│                                         │
│  本周完成率                              │
│  ┌──────────────────────────────┐       │
│  │      ████████░░  78%         │       │
│  └──────────────────────────────┘       │
│                                         │
│  分类时间分布                            │
│  翻译练习  ████████████  45%            │
│  术语背诵  ████████     30%             │
│  笔记整理  ████         15%             │
│  其他      ██           10%             │
│                                         │
│  学习热力图 (近 12 周)                   │
│  ░░█░███░░█░███░░█░██                   │
└─────────────────────────────────────────┘
```

### 3.3 模块二：记忆大师 (Memory)

#### 3.3.1 核心创新：双语对照记忆

**传统方式（Anki/背书匠）**：
```
卡片 A：正面 "The quick brown fox" → 背面 "敏捷的棕色狐狸"
问题：只能单向记忆，无法训练中英对照的整体记忆
```

**Mnemo 方式**：
```
卡片 A：
  source: "The quick brown fox jumps over the lazy dog"
  target: "敏捷的棕色狐狸跳过了懒狗"
  source_lang: "en"
  target_lang: "zh"
  domain: "通用"
  difficulty: 2

训练时可以：
  - 同时看到中英文，训练对照记忆
  - 只看英文，回忆中文（或反过来）
  - 英文挖掉 "jumps"，填中文 "跳过"
  - 中文挖掉 "棕色狐狸"，填英文 "brown fox"
  - 中英文同时挖空
```

#### 3.3.2 卡片数据结构

```typescript
interface MemoryCard {
  id: string;
  user_id: string;
  
  // 核心内容
  source_text: string;       // 源语言文本
  target_text: string;       // 目标语言文本
  source_lang: string;       // "zh" | "en" | "ja" | ...
  target_lang: string;       // "zh" | "en" | "ja" | ...
  
  // 组织
  domain: string;            // 领域：政治翻译/经济/古代史/...
  tags: string[];            // 标签
  difficulty: number;        // 1-5
  
  // SM-2 算法字段
  next_review: datetime;     // 下次复习时间
  review_count: number;      // 已复习次数
  ease_factor: number;       // 难度因子 (默认 2.5)
  interval_days: number;     // 当前间隔天数
  
  // 元数据
  card_type: string;         // "bilingual" | "monolingual"
  extra_data: json;          // 扩展数据
  created_at: datetime;
  updated_at: datetime;
}
```

#### 3.3.3 SM-2 间隔重复算法

```
参数：
  ease_factor (EF): 初始 2.5，范围 1.3-2.5
  interval (I): 间隔天数
  repetition (n): 复习次数

复习评分 (0-5)：
  0 = 完全不记得
  1 = 不记得，但看到答案想起来了
  2 = 不记得，但答案很熟悉
  3 = 记得，但很费力
  4 = 记得，有些犹豫
  5 = 完全记得，毫不费力

算法流程：
  if 评分 >= 3:
    if n == 0: I = 1
    if n == 1: I = 6
    if n >= 2: I = I * EF
    n += 1
  else:
    n = 0  // 重新开始
    I = 1  // 明天再复习
  
  EF = EF + (0.1 - (5 - 评分) * (0.08 + (5 - 评分) * 0.02))
  if EF < 1.3: EF = 1.3
  
  next_review = today + I days
```

#### 3.3.4 八种训练模式

**模式 1：对照阅读 (Dual Reading)**
```
┌─────────────────────────────────────────┐
│  对照阅读                    12 / 30    │
├─────────────────────────────────────────┤
│                                         │
│  EN  The quick brown fox jumps over     │
│      the lazy dog.                      │
│                                         │
│  ZH  敏捷的棕色狐狸跳过了懒狗。          │
│                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐            │
│  │ 需复习 │ │ 已掌握 │ │ 跳过  │            │
│  └──────┘ └──────┘ └──────┘            │
└─────────────────────────────────────────┘
```

**模式 2：英→中填空 (EN→ZH Cloze)**
```
┌─────────────────────────────────────────┐
│  英→中填空                   8 / 30     │
├─────────────────────────────────────────┤
│                                         │
│  The quick brown fox [jumps] over       │
│  the lazy dog.                          │
│                                         │
│  请输入 "jumps" 的中文翻译：              │
│  ┌─────────────────────────────┐        │
│  │ 跳过                        │        │
│  └─────────────────────────────┘        │
│                                         │
│  ┌──────┐ ┌──────┐                     │
│  │ 提交  │ │ 跳过  │                     │
│  └──────┘ └──────┘                     │
└─────────────────────────────────────────┘
```

**模式 3：中→英填空 (ZH→EN Cloze)**
```
  敏捷的[棕色狐狸]跳过了懒狗。
  
  请输入 "棕色狐狸" 的英文：
  ┌─────────────────────────────┐
  │ brown fox                   │
  └─────────────────────────────┘
```

**模式 4：双向填空 (Dual Cloze)**
```
  The quick brown [fox] jumps over the lazy dog.
  敏捷的棕色[狐狸]跳过了懒狗。
  
  请分别填入空缺：
  EN: [fox]    ZH: [狐狸]
```

**模式 5：翻译练习 (Translation)**
```
  请将以下英文翻译为中文：
  
  "The quick brown fox jumps over the lazy dog."
  
  ┌─────────────────────────────┐
  │                             │
  │ （输入你的翻译）              │
  │                             │
  └─────────────────────────────┘
  
  提交后 AI 评分 + 参考答案对比
```

**模式 6：配对练习 (Matching)**
```
  将左列英文与右列中文配对：
  
  ┌──────────────┐     ┌──────────────┐
  │ 1. jumps     │ ──→ │ A. 狐狸      │
  │ 2. brown     │ ──→ │ B. 跳过      │
  │ 3. fox       │ ──→ │ C. 棕色的    │
  │ 4. lazy      │ ──→ │ D. 懒惰的    │
  └──────────────┘     └──────────────┘
  
  正确答案：1-B, 2-C, 3-A, 4-D
```

**模式 7：选择题 (Multiple Choice)**
```
  "jumps" 的中文翻译是？
  
  ○ A. 跑步
  ○ B. 跳过    ← 正确
  ○ C. 爬行
  ○ D. 飞跃
  
  （干扰项由 AI 自动生成）
```

**模式 8：限时挑战 (Timed Challenge)**
```
  ┌─────────────────────────────────────────┐
│  ⏱ 02:30                    得分: 120    │
├─────────────────────────────────────────┤
│                                         │
│  "brown" 的中文翻译是？                   │
│  ○ A. 棕色    ○ B. 蓝色                  │
│  ○ C. 绿色    ○ D. 红色                  │
│                                         │
│  连续正确: 5 🔥  最高记录: 18            │
└─────────────────────────────────────────┘
```

#### 3.3.5 AI 卡片生成

用户粘贴一段文本，AI 自动拆分为双语卡片对：

```
输入：
"""
翻译技巧：增译法是指在翻译时根据目标语的表达习惯，
适当增加一些词语以使译文更加通顺自然。
Translation technique: Amplification refers to the practice
of adding words in translation to make the target text
more fluent and natural according to the expression habits
of the target language.
"""

AI 输出：
[
  {
    "source": "Amplification refers to the practice of adding words in translation",
    "target": "增译法是指在翻译时增加词语的做法",
    "domain": "翻译技巧",
    "difficulty": 3
  },
  {
    "source": "to make the target text more fluent and natural",
    "target": "使译文更加通顺自然",
    "domain": "翻译技巧",
    "difficulty": 2
  },
  ...
]
```

#### 3.3.6 学习统计

```
┌─────────────────────────────────────────┐
│  📊 记忆统计                             │
├─────────────────────────────────────────┤
│  今日                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐            │
│  │待复习 │ │已复习 │ │ 新学 │            │
│  │  30  │ │  12  │ │  5   │            │
│  └──────┘ └──────┘ └──────┘            │
│                                         │
│  总词汇量: 1,247    已掌握: 893 (71.6%)  │
│                                         │
│  领域掌握度                              │
│       政治翻译  ████████████  85%        │
│       经济翻译  ████████░░░░  62%        │
│       科技翻译  ██████░░░░░░  48%        │
│       文化翻译  █████████░░░  73%        │
│                                         │
│  记忆保留率曲线                           │
│  100%│╲                                 │
│   80%│  ╲___                             │
│   60%│      ╲___                         │
│   40%│          ╲___                     │
│   20%│              ╲___                 │
│      └──┬──┬──┬──┬──┬──┬→ 天数          │
│        1  3  7  14 30 60                 │
└─────────────────────────────────────────┘
```

### 3.4 模块三：听课助手 (Lecture)

> ⚠️ 仅桌面端可用（依赖系统音频捕获）

#### 3.4.1 音频捕获方案

| 平台 | 技术方案 | 说明 |
|------|---------|------|
| Windows | WASAPI Loopback | 捕获系统音频输出 |
| macOS | CoreAudio + BlackHole | 需安装 BlackHole 虚拟音频驱动 |
| Linux | PulseAudio Monitor | 捕获默认音频输出 |

#### 3.4.2 转写流程

```
系统音频 → Tauri Rust 后端 → PCM 音频流
    → Fun-ASR WebSocket (实时流式识别)
    → 分句文本 → 前端实时显示

课程结束后：
    → 完整转写文本
    → Deepseek 文本清洗（去口水词/修正标点/分段）
    → Deepseek 笔记生成（结构化笔记/关键词/知识点）
    → 存储到数据库
```

#### 3.4.3 笔记结构

```json
{
  "title": "翻译技巧：增译法与省译法",
  "course_name": "魔法部全程班 Day 15",
  "duration_seconds": 3600,
  "raw_transcript": "嗯...今天我们来讲一下增译法...",
  "cleaned_text": "今天我们来讲一下增译法。增译法是指在翻译时...",
  "structured_notes": {
    "outline": [
      "一、增译法概述",
      "二、增译法的应用场景",
      "三、增译法实例分析"
    ],
    "key_points": [
      "增译法是根据目标语表达习惯增加词语",
      "常见于英译中，因为英文结构更紧凑"
    ],
    "keywords": ["增译法", "amplification", "目标语", "表达习惯"],
    "summary": "本节课主要讲解了增译法的概念、应用场景和实例..."
  }
}
```

#### 3.4.4 私教问答

```
基于课程笔记的 RAG 问答：

用户：增译法和省译法有什么区别？

Mnemo：根据今天课程的内容：
  增译法（Amplification）是在翻译时适当增加词语，
  使译文更通顺自然。省译法则相反，是省略源语中
  不必要的词语。
  
  简单来说：
  - 增译法：英文 "He is a boy of 15" → 中文 "他是个十五岁的男孩"
  - 省译法：英文 "He put his hands in his pockets" → 中文 "他把手插进口袋"
  
  需要我出几道练习题帮你巩固吗？
```

### 3.5 模块四：课表管理 (Schedule)

#### 3.5.1 课表上传与解析

```
支持格式：
  ├── 图片 (PNG/JPG) → AI OCR 识别
  ├── PDF → PDF 解析 + AI OCR
  ├── Excel (.xlsx) → 结构化解析
  └── 手动录入

解析流程：
  上传文件 → AI 识别表格结构 → 提取课程信息
  → 结构化输出 → 用户校对确认 → 保存
```

#### 3.5.2 周视图

```
┌─────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│     │  周一     │  周二     │  周三     │  周四     │  周五     │  周六     │
├─────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 8:00│          │          │          │          │          │          │
│ 9:00│ 魔法部   │          │ 魔法部   │          │ 魔法部   │          │
│     │ 翻译课   │          │ 翻译课   │          │ 翻译课   │          │
│10:00│          │ 米恩     │          │ 米恩     │          │          │
│11:00│          │ 翻译课   │          │ 翻译课   │          │          │
│12:00│          │          │          │          │          │          │
│14:00│          │          │          │          │          │          │
│15:00│          │          │          │          │          │          │
│16:00│          │          │          │          │          │          │
└─────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

#### 3.5.3 冲突检测

```
检测规则：
  同一天 + 时间段重叠 = 冲突

  课程A: 周一 9:00-10:30
  课程B: 周一 10:00-11:30
  → ⚠️ 冲突：周一 10:00-10:30
```

#### 3.5.4 模块联动

```
课表 → 任务系统：
  上课时段自动标记为"忙碌"
  任务排期时避开上课时间

课表 → 听课助手：
  课程关联笔记
  课前提醒 + 课后自动整理笔记

课表 → 统计：
  每周上课时间统计
  学习时间 vs 上课时间分析
```

---

## 4. 产品设计规范

### 4.1 设计原则

1. **简洁优先** — 信息密度适中，不堆砌功能
2. **渐进披露** — 基础功能一目了然，高级功能按需展开
3. **即时反馈** — 每个操作都有视觉/触觉反馈
4. **容错设计** — 可撤销、可恢复、有确认
5. **一致性** — 相同操作在不同模块表现一致

### 4.2 视觉规范

#### 4.2.1 色彩系统

```
主色调：
  Primary:     #6366F1 (Indigo)     — 主操作、链接、选中态
  Primary Light: #818CF8             — 悬停态
  Primary Dark:  #4F46E5             — 按下态

语义色：
  Success:     #22C55E (Green)       — 完成、正确
  Warning:     #F59E0B (Amber)       — 提醒、中等优先级
  Danger:      #EF4444 (Red)         — 错误、高优先级、删除
  Info:        #3B82F6 (Blue)        — 信息、进行中

中性色（亮色模式）：
  Background:  #FFFFFF
  Surface:     #F8FAFC
  Border:      #E2E8F0
  Text Primary: #0F172A
  Text Secondary: #64748B
  Text Muted:  #94A3B8

中性色（暗色模式）：
  Background:  #0F172A
  Surface:     #1E293B
  Border:      #334155
  Text Primary: #F8FAFC
  Text Secondary: #94A3B8
  Text Muted:  #64748B
```

#### 4.2.2 字体

```
中文：系统默认 (PingFang SC / Microsoft YaHei / Noto Sans CJK SC)
英文/数字：Inter / JetBrains Mono (代码)
字号层级：
  h1: 24px / font-weight: 700
  h2: 20px / font-weight: 600
  h3: 16px / font-weight: 600
  body: 14px / font-weight: 400
  caption: 12px / font-weight: 400
```

#### 4.2.3 间距

```
基准单位：4px
xs: 4px    sm: 8px    md: 12px    lg: 16px
xl: 24px   2xl: 32px  3xl: 48px
```

#### 4.2.4 圆角

```
sm: 4px    md: 8px    lg: 12px    xl: 16px    full: 9999px
```

#### 4.2.5 阴影

```
sm: 0 1px 2px rgba(0,0,0,0.05)
md: 0 4px 6px rgba(0,0,0,0.07)
lg: 0 10px 15px rgba(0,0,0,0.1)
```

### 4.3 国际化 (i18n)

#### 4.3.1 语言支持

| 语言 | 代码 | 优先级 |
|------|------|--------|
| 简体中文 | zh-CN | P0 |
| English | en | P0 |

#### 4.3.2 实现方案

```
技术：next-intl
文件结构：
  messages/
    zh-CN.json   — 中文翻译
    en.json      — 英文翻译

切换方式：
  设置页面 → Language → 中文 / English
  存储到 localStorage，刷新后保持

翻译覆盖范围：
  ✅ 所有 UI 文案
  ✅ 错误提示
  ✅ 空状态文案
  ✅ 日期/时间格式
  ❌ 用户生成内容（卡片文本、笔记等）
```

### 4.4 响应式断点

```
Mobile:   < 640px    (安卓端)
Tablet:   640-1024px (平板)
Desktop:  1024-1440px (笔记本)
Wide:     > 1440px   (桌面显示器)

桌面端布局：
  侧边栏 240px + 主内容区自适应

移动端布局：
  底部导航栏 + 全屏内容区
```

### 4.5 动画规范

```
页面切换：    fade + slide，200ms
列表项添加：  slideIn + fadeIn，150ms
列表项删除：  slideOut + fadeOut，150ms
卡片翻转：    rotateY 3D，400ms
按钮点击：    scale(0.95)，100ms
模态弹窗：    scale + fade，200ms
Toast 通知：  slideIn from top，200ms
加载骨架屏：  shimmer pulse，1.5s loop
进度条：      width transition，300ms
```

### 4.6 空状态设计

每个列表/页面在无数据时必须展示空状态：

```
┌─────────────────────────────────────────┐
│                                         │
│           📝 (illustration)              │
│                                         │
│         还没有任务                       │
│    创建你的第一个学习任务吧！              │
│                                         │
│         [ + 创建任务 ]                   │
│                                         │
└─────────────────────────────────────────┘
```

---

## 5. 技术架构

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    客户端 (Tauri)                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Next.js 14 + React 18                 │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │  │
│  │  │ToDoList │ │ Memory  │ │ Lecture │ │Schedule│ │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Tauri Rust 后端                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │  │
│  │  │音频捕获   │ │文件系统   │ │ 本地 SQLite 缓存 │ │  │
│  │  │(loopback)│ │(导入导出) │ │ (离线优先)       │ │  │
│  │  └──────────┘ └──────────┘ └──────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│                  服务端 (腾讯云)                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │              FastAPI (Python)                      │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐ │  │
│  │  │Auth    │ │Tasks   │ │Memory  │ │Lecture    │ │  │
│  │  │Service │ │Service │ │Service │ │Service    │ │  │
│  │  └────────┘ └────────┘ └────────┘ └───────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌──────────┐ ┌───────┐ ┌───────────────────────────┐ │
│  │PostgreSQL│ │ Redis │ │ AI Service Layer          │ │
│  │(主数据库) │ │(缓存) │ │ ┌───────┐ ┌───────────┐ │ │
│  └──────────┘ └───────┘ │ │Fun-ASR│ │ Deepseek  │ │ │
│                         │ └───────┘ └───────────┘ │ │
│                         │ ┌───────┐ ┌───────────┐ │ │
│                         │ │Minimax│ │ Qwen-VL   │ │ │
│                         │ └───────┘ └───────────┘ │ │
│                         └───────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 5.2 技术栈

#### 5.2.1 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14.x | 框架 (App Router) |
| React | 18.x | UI 库 |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 3.x | 样式 |
| shadcn/ui | latest | 组件库 |
| Zustand | 4.x | 状态管理 |
| Axios | 1.x | HTTP 请求 |
| next-intl | 3.x | 国际化 |
| Recharts | 2.x | 图表 |
| Framer Motion | 11.x | 动画 |
| date-fns | 3.x | 日期处理 |
| Lucide React | latest | 图标 |
| React DnD | 16.x | 拖拽排序 |

#### 5.2.2 Tauri (桌面端)

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.x | 桌面应用框架 |
| Rust | latest | 系统级操作 |
| cpal | latest | 音频捕获 |
| rusqlite | latest | 本地 SQLite |
| tauri-plugin-notification | latest | 原生通知 |
| tauri-plugin-global-shortcut | latest | 全局快捷键 |
| tauri-plugin-fs | latest | 文件系统 |

#### 5.2.3 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.11+ | 运行时 |
| FastAPI | 0.115+ | Web 框架 |
| SQLAlchemy | 2.x | ORM |
| Alembic | 1.x | 数据库迁移 |
| asyncpg | 0.29+ | PostgreSQL 异步驱动 |
| Redis | 5.x | 缓存 |
| Pydantic | 2.x | 数据验证 |
| python-jose | 3.x | JWT |
| passlib | 1.x | 密码哈希 |
| httpx | 0.27+ | 异步 HTTP 客户端 |
| uvicorn | 0.30+ | ASGI 服务器 |

#### 5.2.4 AI 服务

| 服务 | 用途 | API |
|------|------|-----|
| Fun-ASR (DashScope) | 语音转写 | WebSocket + REST |
| Deepseek | 文本处理/笔记/问答 | OpenAI 兼容 API |
| Minimax | 卡片生成/文本分析 | REST API |
| Qwen-VL (DashScope) | 图片 OCR | OpenAI 兼容 API |

#### 5.2.5 基础设施

| 技术 | 用途 |
|------|------|
| PostgreSQL 15 | 主数据库 |
| Redis 7 | 缓存 + 会话 |
| Nginx | 反向代理 + 静态文件 |
| systemd | 进程管理 |
| SQLite | 客户端离线缓存 |

### 5.3 项目目录结构

```
mnemo/
├── src-tauri/                    # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs              # 入口
│   │   ├── audio_capture.rs     # 系统音频捕获
│   │   ├── file_ops.rs          # 文件操作
│   │   └── db.rs                # 本地 SQLite
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                          # Next.js 前端
│   ├── app/                      # App Router 页面
│   │   ├── (auth)/login/
│   │   ├── (app)/
│   │   │   ├── dashboard/
│   │   │   ├── tasks/
│   │   │   ├── memory/
│   │   │   │   ├── cards/       # 卡片管理
│   │   │   │   ├── train/       # 训练模式
│   │   │   │   │   ├── dual-read/
│   │   │   │   │   ├── cloze/
│   │   │   │   │   ├── translate/
│   │   │   │   │   ├── matching/
│   │   │   │   │   ├── quiz/
│   │   │   │   │   └── challenge/
│   │   │   │   └── stats/       # 学习统计
│   │   │   ├── lecture/
│   │   │   └── schedule/
│   │   ├── settings/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                   # shadcn/ui 组件
│   │   ├── layout/               # 布局组件
│   │   ├── tasks/                # 任务相关组件
│   │   ├── memory/               # 记忆相关组件
│   │   ├── lecture/              # 听课相关组件
│   │   └── schedule/             # 课表相关组件
│   ├── lib/
│   │   ├── api.ts                # API 客户端
│   │   ├── utils.ts              # 工具函数
│   │   └── i18n.ts               # 国际化配置
│   ├── stores/
│   │   ├── auth.ts               # 认证状态
│   │   ├── tasks.ts              # 任务状态
│   │   ├── memory.ts             # 记忆状态
│   │   └── settings.ts           # 设置状态
│   ├── types/
│   │   └── index.ts              # TypeScript 类型
│   ├── hooks/                    # 自定义 Hooks
│   └── messages/
│       ├── zh-CN.json            # 中文翻译
│       └── en.json               # 英文翻译
├── backend/                      # FastAPI 后端
│   ├── app/
│   │   ├── api/                  # 路由
│   │   │   ├── auth.py
│   │   │   ├── tasks.py
│   │   │   ├── memory.py
│   │   │   ├── lecture.py
│   │   │   ├── schedule.py
│   │   │   └── ai.py
│   │   ├── core/
│   │   │   ├── config.py         # 配置
│   │   │   ├── security.py       # 安全
│   │   │   ├── database.py       # 数据库
│   │   │   └── exceptions.py     # 异常处理
│   │   ├── models/               # SQLAlchemy 模型
│   │   ├── schemas/              # Pydantic 模型
│   │   ├── services/             # 业务逻辑
│   │   │   ├── task_service.py
│   │   │   ├── memory_service.py
│   │   │   ├── sm2.py            # SM-2 算法
│   │   │   ├── asr_service.py    # ASR 服务
│   │   │   ├── llm_service.py    # LLM 服务
│   │   │   └── ocr_service.py    # OCR 服务
│   │   └── main.py
│   ├── alembic/                  # 数据库迁移
│   ├── requirements.txt
│   └── tests/
├── docs/
│   └── WHITEPAPER.md             # 本文档
├── .env
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── README.md
```

---

## 6. 数据模型

### 6.1 ER 关系图

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│  users   │────<│  tasks   │     │ memory_cards │
│          │     │          │     │              │
│ id       │     │ id       │     │ id           │
│ username │     │ user_id  │     │ user_id      │
│ email    │     │ title    │     │ source_text  │
│ password │     │ status   │     │ target_text  │
│ nickname │     │ priority │     │ domain       │
│ ...      │     │ ...      │     │ next_review  │
└────┬─────┘     └──────────┘     │ ...          │
     │                             └──────────────┘
     │
     ├─────<┌──────────────┐
     │      │ course_notes │
     │      │              │
     │      │ id           │
     │      │ user_id      │
     │      │ title        │
     │      │ transcript   │
     │      │ notes        │
     │      │ ...          │
     │      └──────────────┘
     │
     ├─────<┌──────────┐─────<┌─────────────────┐
     │      │ schedules│     │ schedule_entries │
     │      │          │     │                 │
     │      │ id       │     │ id              │
     │      │ user_id  │     │ schedule_id     │
     │      │ name     │     │ course_name     │
     │      │ is_active│     │ day_of_week     │
     │      │ ...      │     │ start_time      │
     │      └──────────┘     │ end_time        │
     │                        │ ...             │
     │                        └─────────────────┘
     │
     └─────<┌──────────────┐
            │ check_in_logs │
            │              │
            │ id           │
            │ user_id      │
            │ date         │
            │ task_count   │
            │ study_minutes│
            │ ...          │
            └──────────────┘
```

### 6.2 表结构详细定义

#### users

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 用户 ID |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 用户名 |
| email | VARCHAR(100) | UNIQUE, NOT NULL | 邮箱 |
| hashed_password | VARCHAR(255) | NOT NULL | 密码哈希 |
| nickname | VARCHAR(50) | NULL | 昵称 |
| avatar_url | VARCHAR(500) | NULL | 头像 URL |
| locale | VARCHAR(10) | DEFAULT 'zh-CN' | 语言偏好 |
| is_active | BOOLEAN | DEFAULT true | 是否激活 |
| created_at | TIMESTAMPTZ | DEFAULT now() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT now() | 更新时间 |

#### tasks

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 任务 ID |
| user_id | UUID | FK → users.id | 所属用户 |
| parent_id | UUID | FK → tasks.id, NULL | 父任务（子任务） |
| title | VARCHAR(200) | NOT NULL | 标题 |
| description | TEXT | NULL | 描述 |
| status | VARCHAR(20) | DEFAULT 'pending' | pending/in_progress/completed |
| priority | VARCHAR(10) | DEFAULT 'medium' | high/medium/low |
| category_id | UUID | FK → categories.id, NULL | 分类 |
| due_date | TIMESTAMPTZ | NULL | 截止日期 |
| start_time | TIME | NULL | 开始时间 |
| end_time | TIME | NULL | 结束时间 |
| estimated_minutes | INTEGER | NULL | 预估时长 |
| sort_order | INTEGER | DEFAULT 0 | 排序 |
| tags | JSONB | NULL | 标签数组 |
| completed_at | TIMESTAMPTZ | NULL | 完成时间 |
| created_at | TIMESTAMPTZ | DEFAULT now() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT now() | 更新时间 |

#### categories

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 分类 ID |
| user_id | UUID | FK → users.id | 所属用户 |
| name | VARCHAR(50) | NOT NULL | 分类名称 |
| color | VARCHAR(20) | NULL | 颜色 |
| icon | VARCHAR(50) | NULL | 图标 |
| sort_order | INTEGER | DEFAULT 0 | 排序 |

#### check_in_logs

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 日志 ID |
| user_id | UUID | FK → users.id | 所属用户 |
| date | DATE | NOT NULL, UNIQUE(user_id, date) | 日期 |
| tasks_completed | INTEGER | DEFAULT 0 | 完成任务数 |
| cards_reviewed | INTEGER | DEFAULT 0 | 复习卡片数 |
| study_minutes | INTEGER | DEFAULT 0 | 学习分钟数 |
| created_at | TIMESTAMPTZ | DEFAULT now() | 创建时间 |

#### memory_cards

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 卡片 ID |
| user_id | UUID | FK → users.id | 所属用户 |
| source_text | TEXT | NOT NULL | 源语言文本 |
| target_text | TEXT | NOT NULL | 目标语言文本 |
| source_lang | VARCHAR(10) | DEFAULT 'en' | 源语言 |
| target_lang | VARCHAR(10) | DEFAULT 'zh' | 目标语言 |
| domain | VARCHAR(50) | DEFAULT '未分类' | 领域 |
| tags | JSONB | NULL | 标签 |
| difficulty | INTEGER | DEFAULT 3 | 难度 1-5 |
| card_type | VARCHAR(20) | DEFAULT 'bilingual' | bilingual/monolingual |
| next_review | TIMESTAMPTZ | DEFAULT now() | 下次复习 |
| review_count | INTEGER | DEFAULT 0 | 复习次数 |
| ease_factor | FLOAT | DEFAULT 2.5 | SM-2 难度因子 |
| interval_days | INTEGER | DEFAULT 0 | SM-2 间隔天数 |
| last_reviewed_at | TIMESTAMPTZ | NULL | 上次复习时间 |
| extra_data | JSONB | NULL | 扩展数据 |
| is_frozen | BOOLEAN | DEFAULT false | 是否冻结 |
| created_at | TIMESTAMPTZ | DEFAULT now() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT now() | 更新时间 |

#### review_logs

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 日志 ID |
| card_id | UUID | FK → memory_cards.id | 卡片 ID |
| user_id | UUID | FK → users.id | 用户 ID |
| mode | VARCHAR(30) | NOT NULL | 训练模式 |
| rating | INTEGER | NOT NULL | 评分 0-5 |
| time_spent_ms | INTEGER | NULL | 花费时间 |
| is_correct | BOOLEAN | NULL | 是否正确 |
| created_at | TIMESTAMPTZ | DEFAULT now() | 创建时间 |

#### course_notes

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 笔记 ID |
| user_id | UUID | FK → users.id | 所属用户 |
| title | VARCHAR(200) | NOT NULL | 标题 |
| course_name | VARCHAR(200) | NULL | 课程名称 |
| raw_transcript | TEXT | NULL | 原始转写 |
| cleaned_text | TEXT | NULL | 清洗后文本 |
| structured_notes | JSONB | NULL | 结构化笔记 |
| summary | TEXT | NULL | 摘要 |
| audio_file_url | VARCHAR(500) | NULL | 音频文件 URL |
| duration_seconds | INTEGER | NULL | 时长 |
| created_at | TIMESTAMPTZ | DEFAULT now() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT now() | 更新时间 |

#### schedules

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 课表 ID |
| user_id | UUID | FK → users.id | 所属用户 |
| name | VARCHAR(200) | NOT NULL | 课表名称 |
| version | INTEGER | DEFAULT 1 | 版本号 |
| is_active | BOOLEAN | DEFAULT true | 是否激活 |
| source_file_url | VARCHAR(500) | NULL | 源文件 URL |
| created_at | TIMESTAMPTZ | DEFAULT now() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT now() | 更新时间 |

#### schedule_entries

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 条目 ID |
| schedule_id | UUID | FK → schedules.id | 所属课表 |
| course_name | VARCHAR(200) | NOT NULL | 课程名称 |
| teacher | VARCHAR(100) | NULL | 教师 |
| location | VARCHAR(200) | NULL | 地点 |
| day_of_week | INTEGER | NOT NULL | 星期几 1-7 |
| start_time | VARCHAR(10) | NOT NULL | 开始时间 HH:MM |
| end_time | VARCHAR(10) | NOT NULL | 结束时间 HH:MM |
| weeks | JSONB | NULL | 周次数组 |
| color | VARCHAR(20) | NULL | 颜色 |

---

## 7. AI 服务集成

### 7.1 Fun-ASR (语音识别)

**用途**：听课助手的实时/离线语音转写

**接入方式**：DashScope WebSocket API

```
实时流式：
  WebSocket → wss://dashscope.aliyuncs.com/api-ws/v1/inference
  
  流程：
  1. 建立 WebSocket 连接
  2. 发送音频流 (PCM 16kHz 16bit mono)
  3. 接收实时转写结果
  4. 断线自动重连

离线文件：
  REST API → POST https://dashscope.aliyuncs.com/api/v1/services/audio/asr
  
  流程：
  1. 上传音频文件
  2. 等待转写完成
  3. 获取完整转写文本
```

### 7.2 Deepseek (文本处理)

**用途**：文本清洗、笔记生成、私教问答、翻译评分

**接入方式**：OpenAI 兼容 API

```
Endpoint: https://api.deepseek.com/chat/completions
Model: deepseek-chat

Prompt 设计：

文本清洗：
  system: "你是一个专业的文本整理助手。请将以下语音转写文本进行整理：
  1. 去除口水词（嗯、啊、就是、然后、那个、这个）
  2. 修正标点符号
  3. 按语义分段
  4. 保留原文的所有实质内容
  只输出整理后的文本，不要解释。"

笔记生成：
  system: "你是一个专业的学习笔记助手。请根据以下课程转写文本生成结构化笔记：
  1. 提炼 3-5 个核心要点
  2. 提取关键词列表
  3. 生成 100 字以内的课程摘要
  4. 按逻辑分段组织
  输出 JSON 格式。"

私教问答：
  system: "你是 {course_name} 的私教老师。基于以下课程笔记回答学生的问题。
  如果笔记中没有相关信息，请诚实说明。
  回答要简洁、准确、有教学性。"

卡片生成：
  system: "你是一个语言学习助手。请将以下文本拆分为双语对照卡片对。
  每张卡片包含 source_text（原文片段）和 target_text（对应翻译）。
  评估每张卡片的难度（1-5）。
  输出 JSON 数组。"
```

### 7.3 Minimax (文本分析)

**用途**：大批量卡片生成、文本分析（Deepseek 的备用）

**接入方式**：REST API

```
Endpoint: https://api.minimax.chat/v1/text/chatcompletion_v2
Model: MiniMax-Text-01 (或 Token Plan 支持的模型)

用途：
  - 大批量文本处理（Token Plan 适合）
  - Deepseek 不可用时的 fallback
  - 选择题干扰项生成
```

### 7.4 Qwen-VL (图片 OCR)

**用途**：课表图片识别

**接入方式**：DashScope OpenAI 兼容 API

```
Endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
Model: qwen-vl-max

Prompt:
  "请识别这张课表图片中的所有课程信息，输出 JSON 格式：
  [
    {
      'course_name': '课程名称',
      'teacher': '教师姓名',
      'location': '上课地点',
      'day_of_week': 1-7,
      'start_time': 'HH:MM',
      'end_time': 'HH:MM'
    }
  ]"
```

---

## 8. 跨平台策略

### 8.1 Tauri 桌面端（主力）

```
优势：
  - 系统音频捕获（听课助手核心能力）
  - 原生通知
  - 系统托盘
  - 全局快捷键
  - 文件系统直接访问
  - 离线优先（本地 SQLite）
  - 安装包体积小（~10MB vs Electron ~100MB）

打包目标：
  Windows: .msi / .exe (NSIS)
  macOS:   .dmg
  Linux:   .AppImage / .deb
```

### 8.2 Web 端（补充）

```
部署：
  Next.js 静态导出 → Nginx 托管
  或 Next.js SSR → Node.js 服务

功能差异：
  ✅ 任务管理（完整）
  ✅ 记忆大师（完整）
  ❌ 听课助手（无系统音频捕获，仅支持文件上传转写）
  ✅ 课表管理（完整）

PWA 支持：
  - Service Worker 离线缓存
  - manifest.json
  - 可添加到主屏幕
```

### 8.3 安卓端（移动补充）

```
技术：Capacitor
功能差异：
  ✅ 任务管理（完整）
  ✅ 记忆大师（完整）
  ❌ 听课助手（完全不可用）
  ✅ 课表管理（完整）

布局适配：
  - 底部导航栏替代侧边栏
  - 触摸优化（更大的点击区域）
  - 手势支持（左滑删除等）
```

---

## 9. 安全与隐私

### 9.1 认证与授权

```
认证方式：JWT (JSON Web Token)
Token 有效期：7 天
密码哈希：bcrypt (cost factor 12)
传输加密：HTTPS (TLS 1.2+)
```

### 9.2 数据安全

```
密码存储：bcrypt 哈希，不存储明文
API Key：服务端环境变量，不进入代码仓库
数据库：PostgreSQL 连接使用 SSL
备份：每日自动备份到本地 + 云端
```

### 9.3 API 安全

```
速率限制：100 次/分钟/IP
输入验证：Pydantic 模型验证
XSS 防护：前端输出转义
CSRF 防护：SameSite Cookie
SQL 注入：SQLAlchemy ORM 参数化查询
```

### 9.4 隐私政策

```
数据收集：仅收集用户主动输入的数据
数据使用：仅用于提供 Mnemo 服务
数据共享：不与第三方共享
数据删除：用户可随时请求删除所有数据
数据导出：用户可随时导出所有数据
```

---

## 10. 部署架构

### 10.1 服务器配置

| 服务器 | IP | 用途 | 系统 |
|--------|-----|------|------|
| 主力机 | 106.53.10.184 | 全部服务 | OpenCloudOS 9.4 + 宝塔面板 |
| 备机 | 119.91.117.90 | 灾备（暂未部署） | Ubuntu 22.04 |

### 10.2 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Nginx (前端) | 3000 | 静态文件托管 |
| Nginx (API) | 8000 | API 反向代理 |
| FastAPI | 8001 (内部) | 后端服务 |
| PostgreSQL | 5432 (内部) | 数据库 |
| Redis | 6379 (内部) | 缓存 |
| 宝塔面板 | 8888 | 服务器管理 |

### 10.3 资源使用

```
服务器配置：2GB RAM / 40GB Disk / 2 vCPU

预估资源占用：
  PostgreSQL:  ~100MB RAM
  Redis:       ~50MB RAM (限制 256MB)
  FastAPI:     ~200MB RAM (2 workers)
  Nginx:       ~20MB RAM
  系统:        ~300MB RAM
  ─────────────────────
  剩余可用:    ~1.3GB RAM
```

---

## 11. 开发路线图

### Sprint 0：基础设施加固（4 天）— ✅ 已完成

```
[后端架构]
  ✅ models.py 完整重写（所有表 + ForeignKey + DailyCheckin）
  ✅ 统一 API 响应格式 core/response.py（{code, message, data}）
  ✅ 全局异常处理 core/exceptions.py（500/HTTP/422）
  ✅ main.py 更新（异常注册 + 日志 + 品牌名 Mnemo）
  ✅ config.py 更新（APP_NAME=Mnemo）
  ✅ auth.py 适配统一响应
  ✅ schemas.py 新增 DailyCheckin
  ✅ tasks/memory/courses/schedule/ai API 适配统一响应
  ⬜ Alembic 数据库迁移初始化（暂用 create_all，后续 Sprint 补充）

[前端架构]
  ✅ i18n 框架（zh.json + en.json ~200 keys）
  ✅ useTranslation hook（嵌套 key + 变量插值）
  ✅ locale store（中英切换 + localStorage）
  ✅ 暗色模式（next-themes ThemeProvider）
  ✅ 请求层重构（30s 超时 + 统一错误 + 网络异常提示）
  ✅ auth store 更新（mnemo_token + api client 联动）
  ✅ 骨架屏组件（Skeleton/CardSkeleton/ListSkeleton/DashboardSkeleton）
  ✅ 空状态组件 EmptyState
  ✅ 错误状态组件 ErrorState
  ✅ 所有页面 i18n 化（sidebar/login/dashboard/tasks/memory/courses/schedule）
  ✅ layout.tsx 集成 ThemeProvider + Toaster
  ✅ 前端构建验证（next build 通过）
  ✅ 部署到服务器并验证

[部署验证]
  ✅ 后端部署 + API 测试（注册/登录/health 全部通过）
  ✅ 前端构建 + 部署 + 端到端测试（HTTP 200）
  ✅ 统一响应格式生效（{code:0, message:"ok", data:{...}}）
```

### Sprint 1：任务管理完整版（10 天）— ✅ 已完成

```
[后端 API]
  ✅ 任务分类 CRUD（TaskCategory 表 + API）
  ✅ 子任务支持（Task.subtasks JSON 字段 + API）
  ✅ 任务统计 API（完成率/分类分布/连续天数/每日完成）
  ✅ 打卡 API（DailyCheckin create + 按月查询）
  ✅ Bearer Token 认证修复（所有 API 统一使用 oauth2_scheme）
  ✅ 任务搜索 + 多维度筛选（状态/分类/优先级/过期）
  ✅ 任务排序（置顶/优先级/截止日期）

[前端 UI]
  ✅ 任务列表页重写（搜索/筛选/排序/视图切换）
  ✅ 任务创建/编辑弹窗（分类/标签/子任务/优先级/截止日期）
  ✅ 任务卡片（优先级颜色/过期标记/子任务进度/置顶）
  ✅ Dashboard 统计面板（完成率/连续天数/分类分布/快捷操作）
  ✅ 打卡日历组件（月度日历 + 打卡标记 + 统计摘要）
  ✅ 周视图（按周展示任务 + 前后翻页 + 今日高亮）
  ✅ Tab 切换（任务列表/打卡日历/周视图）
  ✅ i18n 扩展（~320 keys，月份名/星期名/打卡文案）
  ✅ Checkbox 组件
  ✅ 前端构建 + 部署验证
```
[后端]
  任务分类/标签/子任务 API
  打卡记录 + 统计聚合 API
  搜索/筛选/排序 API

[前端]
  日/周/看板三种视图
  任务创建/编辑弹窗
  打卡日历 + 连续天数
  统计图表（完成率/分布/热力图）
  空状态引导
```

### Sprint 2：记忆大师核心（14 天）— ✅ 已完成

```
[后端 API]
  ✅ 卡片 CRUD（创建/列表/详情/更新/删除）
  ✅ SM-2 间隔重复算法（ease_factor/interval/review_count/mastery）
  ✅ 复习队列 API（next_review <= now，按优先级排序）
  ✅ 复习提交 API（POST /review/{card_id}，返回 SM-2 更新）
  ✅ 学习统计 API（总数/掌握/待复习/总复习/领域分布/难度分布）
  ✅ 批量导入 API（POST /memory/batch）

[前端 UI]
  ✅ 卡片库管理页面（搜索/筛选/CRUD/翻页）
  ✅ 卡片创建/编辑弹窗（正面/背面/领域/难度）
  ✅ SM-2 间隔复习模式（翻转卡片 + 5 级评分）
  ✅ 学习统计面板（总数/掌握率/领域分布/难度分布）
  ✅ Tab 切换（卡片库/复习/统计）
  ✅ i18n 扩展（~80 memory keys）
```

### Sprint 3：听课助手（14 天）— ✅ 已完成

```
[后端 API]
  ✅ 课程笔记 CRUD（创建/列表/详情/删除）
  ✅ AI 文本清洗（POST /ai/clean-text，JSON body）
  ✅ AI 笔记生成（POST /ai/generate-notes，返回摘要+结构化笔记）
  ✅ AI 私教问答（POST /ai/chat，支持对话历史）
  ✅ AI 卡片生成（POST /ai/generate-cards）
  ✅ 所有 AI 端点改为 JSON body（不再用 query params）
  ✅ 无 API key 时优雅降级（返回提示而非 500）

[前端 UI]
  ✅ 笔记管理页面（搜索/课程筛选/CRUD/详情查看）
  ✅ 笔记创建弹窗（标题/课程名/转写文本）
  ✅ AI 清洗按钮（一键清洗转写文本）
  ✅ AI 生成笔记按钮（自动生成摘要+结构化笔记并保存）
  ✅ 笔记详情页（原始转写/清洗文本/结构化笔记/摘要 Tab 切换）
  ✅ 私教问答对话界面（上下文输入+多轮对话+Markdown 渲染）
  ✅ Tab 切换（笔记管理/私教问答）
  ✅ i18n 扩展（~40 courses keys）
```

### Sprint 4：课表管理 + 联动（7 天）— ✅ 已完成

```
[后端 API]
  ✅ 课表 CRUD（创建/列表/获取活跃/删除）
  ✅ 冲突检测 API（同一天时间重叠检测）
  ✅ 修复 SQLAlchemy async lazy-load 问题（手动 eager load entries）

[前端 UI]
  ✅ 周视图课程表（7天 × 时间轴网格）
  ✅ 课程卡片渲染（颜色/课程名/教师/地点/时间）
  ✅ 添加课程弹窗（课程名/教师/地点/时间/颜色选择）
  ✅ 冲突检测提示（Badge 显示冲突数量）
  ✅ 课程列表侧栏（按星期分组）
  ✅ 删除课表功能
  ✅ i18n 扩展（~30 schedule keys）
```

### Sprint 5：品质打磨（10 天）— ✅ 已完成

```
[课表导入]
  ✅ JSON 导入（通用格式 + Wakeup 课程表格式自动识别）
  ✅ CSV 导入（支持 UTF-8/GBK 编码，中英文列名）
  ✅ 图片 OCR 导入（AI 识别课表截图，需 Deepseek API key）
  ✅ JSON 导出（下载当前课表为 JSON 文件）
  ✅ 前端导入弹窗（3 种方式选择 + loading 状态）
  ✅ 前端导出按钮（一键下载 JSON）
  ✅ i18n 扩展（~10 import/export keys）
```

### Sprint 6：跨平台打包（7 天）— ✅ 已完成

```
[PWA]
  ✅ manifest.json（name/icons/theme/display）
  ✅ Service Worker（network-first + 离线回退）
  ✅ PWA 图标（192x192 + 512x512）
  ✅ Apple Web App 元数据
  ✅ layout.tsx PWA metadata 集成

[Tauri 桌面端]
  ✅ 项目骨架（tauri.conf.json / Cargo.toml / src/）
  ✅ 窗口配置（1280x800 / min 900x600 / 居中）
  ✅ CSP 安全策略
  ✅ 注：需本地 Rust 环境执行 cargo tauri build

[Capacitor 移动端]
  ✅ capacitor.config.json（Android/iOS）
  ✅ 插件配置（StatusBar / Keyboard / SplashScreen）
  ✅ 注：需 Android Studio / Xcode 执行打包
```

### 时间线

```
Sprint 0: ████░░░░░░░░░░░░░░░░  4天
Sprint 1: ██████████░░░░░░░░░░  10天
Sprint 2: ██████████████░░░░░░  14天
Sprint 3: ██████████████░░░░░░  14天
Sprint 4: ████████░░░░░░░░░░░░  7天
Sprint 5: ██████████░░░░░░░░░░  10天
Sprint 6: ████████████████████  100% ✅
          ─────────────────────
          全部 Sprint 已完成！
          2026-04-20 一天内交付
```

---

## 12. 版本更新日志

### v0.2.0-sprint0 (2026-04-20) — ✅ 已完成

**Sprint 0：基础设施加固**

**后端变更**：
- [x] `models.py` 完整重写：所有 6 张表 + ForeignKey 关系 + 新增 `DailyCheckin` 表 + `User.locale` 字段
- [x] 新增 `core/response.py`：统一 API 响应格式 `{code, message, data}`
- [x] 新增 `core/exceptions.py`：全局异常处理（500/HTTP/422）
- [x] `main.py`：注册全局异常处理器、配置 logging、品牌名改为 Mnemo
- [x] `config.py`：APP_NAME → "Mnemo"，JWT_SECRET 更新
- [x] `auth.py`：适配统一响应格式
- [x] `schemas.py`：新增 DailyCheckinCreate/DailyCheckinOut
- [x] `tasks.py` / `memory.py` / `courses.py` / `schedule.py` / `ai.py`：已适配统一响应
- [ ] Alembic 迁移：暂用 create_all，后续 Sprint 补充

**前端变更**：
- [x] 新增 `i18n/zh.json` + `i18n/en.json`：~200 个翻译 key
- [x] 新增 `lib/i18n.ts`：useTranslation hook（嵌套 key + 变量插值）
- [x] 新增 `stores/locale.ts`：中英切换 + localStorage 持久化
- [x] 新增 `components/providers/theme-provider.tsx`：next-themes 暗色模式
- [x] 重构 `lib/api.ts`：30s 超时、统一错误处理、网络异常提示
- [x] 更新 `stores/auth.ts`：token key → `mnemo_token`，与 api client 联动
- [x] 新增 `components/ui/skeleton.tsx`：骨架屏组件
- [x] 新增 `components/ui/empty-state.tsx`：空状态组件
- [x] 新增 `components/ui/error-state.tsx`：错误状态组件
- [x] 所有页面 i18n 化：sidebar / login / dashboard / tasks / memory / courses / schedule
- [x] `layout.tsx`：集成 ThemeProvider + Toaster，metadata 更新为 Mnemo
- [x] 前端构建验证（next build 通过，10 个静态页面）
- [x] 部署到服务器（后端 19 文件 + 前端 100 文件）

**依赖变更**：
- [x] 前端新增：`next-intl`

---

### v0.1.0-draft (2026-04-20)

**状态**：骨架搭建完成

**已完成**：
- [x] 项目初始化（Next.js + FastAPI + PostgreSQL + Redis）
- [x] 服务器部署（宝塔机 106.53.10.184）
- [x] 后端 API 骨架（6 个模块 CRUD 端点）
- [x] 前端页面骨架（6 个页面）
- [x] 用户注册/登录（JWT 认证）
- [x] SSH 部署密钥配置
- [x] 产品白皮书 v1.0

---

> 本文档随项目迭代持续更新。每次版本发布时在「版本更新日志」章节追加记录。
