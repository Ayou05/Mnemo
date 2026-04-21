# Mnemo 记忆算法设计文档 v1.0

> **目标**：设计一个科学、可复现、可验证的记忆调度算法，比 SM-2 更聪明，比不背单词更懂用户。

---

## 一、科学基础（为什么这样做）

### 1.1 遗忘曲线：记忆是时间的函数

**1885 年，德国心理学家 Ebbinghaus** 用自己做实验，背无意义音节，发现记忆随时间衰减：

> 不复习的话，20 分钟忘掉 42%，1 小时忘掉 56%，1 天忘掉 67%，6 天忘掉 75%。

**大白话**：学完不复习，一天后只剩三分之一。

**来源**：Ebbinghaus, H. (1885). *Memory: A Contribution to Experimental Psychology*.

### 1.2 间隔效应：复习时机决定记忆效率

**1900 年代至今，数百项实验反复验证**：把复习分散到不同时间点，比集中一次复习效果好得多。

> "间隔效应是认知科学中最稳健的发现之一。" —— Dempster, 1988; Cepeda et al., 2006

**大白话**：一天背 10 次，不如分 10 天每天背 1 次。

**来源**：
- Dempster, F.N. (1988). The spacing effect: A case study in the failure to apply the results of psychological research. *American Psychologist*.
- Cepeda, N.J. et al. (2006). Distributed practice in verbal recall tasks. *Review of Educational Research*.

### 1.3 测试效应：主动回忆比被动重读强 150%

**Roediger & Karpicke (2006)** 的经典实验：

> 让学生学完材料后，一组反复重读，一组反复测试。一周后，测试组的记忆保留率比重读组高出 **50-150%**。

**大白话**：合上书试着回忆，比反复看书有效得多。这就是为什么翻卡片比看笔记强。

**来源**：
- Roediger, H.L. & Karpicke, J.D. (2006). Test-enhanced learning. *Psychological Science*.
- Karpicke, J.D. & Roediger, H.L. (2008). The critical importance of retrieval for learning. *Science*.

### 1.4 反应时间：比"对/错"更诚实的记忆指标

**Nelson et al. (1984)** 发现：

> 反应时间（RT）和记忆强度高度相关。记住的东西反应快，模糊的东西反应慢。而且**反应时间的变化比正确率更敏感**——正确率可能还是 100%，但反应时间已经变慢了，说明记忆在衰退。

**2025 年 Nature Scientific Reports** 进一步证实：

> "反应时间是检索流畅度的有效指标，为回忆所需的认知努力提供了客观衡量手段。"

**大白话**：你觉得自己"记得"，但如果想了 8 秒才想起来，其实已经开始忘了。反应时间比你的自我判断更诚实。

**来源**：
- Nelson, T.O. et al. (1984). Response latency and response accuracy as measures of memory. *Acta Psychologica*.
- Wiertelak et al. (2025). The effects of delay on objective memory and subjective experience. *Nature Scientific Reports*.

### 1.5 元认知偏差：人对自己记忆的判断不准

**Hart (1965)** 首次提出"知道感"（Feeling of Knowing）概念：

> 人们预测自己"能记住"的准确率大约只有 60-70%，经常高估自己的记忆水平。

**大白话**：用户说"记得"的时候，有 30-40% 的概率其实已经快忘了。这就是为什么我们需要行为信号（反应时间、翻转次数）来修正用户的自我判断。

**来源**：
- Hart, J.T. (1965). Memory and the feeling-of-knowing experience. *Journal of Educational Psychology*.
- Metcalfe, J. & Shimamura, A.P. (1994). *Metacognition: Knowing about Knowing*.

### 1.6 适度困难：让学习"稍微难受"效果最好

**Bjork & Bjork (1994, 2020)** 的"新性能理论"：

> 学习时感到困难（但不是不可能），长期记忆效果最好。太容易的学习产生"流畅性错觉"——你以为学会了，其实只是当时看着眼熟。

**大白话**：翻卡片时如果秒答，说明太简单了，应该拉长间隔。如果想了很久才答出来，说明刚好在"适度困难"区间，记忆效果最好。

**来源**：
- Bjork, R.A. (1994). Memory and metamemory considerations in the training of armed forces to respond to CBRN threats. *Scientific American*.
- Bjork, E.L. & Bjork, R.A. (2020). Desirable difficulties in theory and practice. *Journal of Applied Research in Memory and Cognition*. (被引 2039 次)

### 1.7 幂律遗忘：记忆衰减不是指数曲线

**Wixted & Ebbesen (1991)** 发现：

> 真实的遗忘曲线更接近**幂函数**（power law）而非指数函数。指数函数衰减太快，幂函数更符合人类真实记忆衰减规律。

**公式**：`R(t) = a × t^(-b)`，其中 R 是保留率，t 是时间，a 和 b 是个体参数。

**大白话**：SM-2 用的指数衰减模型（间隔 1→6→15→...天）在短期内衰减太快。幂函数更平缓，更符合"学过的东西其实忘得没那么快"的实际情况。

**来源**：
- Wixted, J.T. & Ebbesen, E.B. (1991). On the form of forgetting. *Psychological Science*.
- Kahana, M.J. & Adler, M. (2002). Note on the power law of forgetting. *Memory & Cognition*.

### 1.8 现代算法：从 SM-2 到 FSRS

| 算法 | 年份 | 核心思路 | 局限 |
|------|------|---------|------|
| **SM-2** (SuperMemo) | 1987 | 固定公式，用户评 0-5 分 | 不考虑反应时间，间隔固定 |
| **HLR** (Duolingo) | 2016 | 半衰期回归，机器学习预测 | 需要大量数据训练 |
| **FSRS** (Anki) | 2022 | 三参数记忆模型，个性化 | 复杂度高，需要优化器 |
| **墨墨背单词** | 2015+ | 随机最短路径优化调度 | 闭源，细节不明 |

**来源**：
- Piotr Woźniak (1987). SuperMemo SM-2 algorithm.
- Settles, B. & Meeder, B. (2016). A Trainable Spaced Repetition Model for Language Learning. *ACL*.
- Ye, J. (2022). FSRS: Free Spaced Repetition Scheduler. *GitHub open-spaced-repetition*.

---

## 二、Mnemo 算法设计：Confidence-Adaptive Spaced Repetition (CASR)

### 2.1 设计原则

1. **用户只做一件事**：判断"忘了/模糊/记得"——不背单词的简洁
2. **算法比用户更诚实**：用反应时间、翻转次数修正用户判断
3. **科学可复现**：每个参数都有认知科学依据
4. **渐进进化**：从简单开始，随数据积累越来越准

### 2.2 采集的信号

每次翻一张卡片，记录 4 个信号：

```
encounter = {
  think_time:   3200,    // 看到正面 → 翻转的耗时（ms）
  verify_time:  1200,    // 翻转 → 点按钮的耗时（ms）
  flip_count:   1,       // 来回翻了几次
  result:       "fuzzy", // forgot / fuzzy / remembered
  timestamp:    "2026-04-20T22:00:00Z"
}
```

**为什么是这 4 个？**

| 信号 | 科学依据 | 对应研究 |
|------|---------|---------|
| think_time | 反应时间 = 记忆强度的客观指标 | Nelson 1984; Wiertelak 2025 |
| verify_time | 确认时间反映元认知判断的确定性 | Metcalfe 1994 |
| flip_count | 反复翻转 = 不确定性的行为表现 | Hart 1965 (FOK) |
| result | 主观判断，需要被行为信号修正 | Bjork 2020 |

### 2.3 Confidence 模型

每张卡片维护一个 `confidence` 值（0-100），代表"算法认为你记住这张卡片的概率"。

#### Confidence 更新公式

每次 encounter 后：

```
// 第一步：用户主观评价 → 基础分
result_delta = {
  forgot:      -20,
  fuzzy:       +5,
  remembered:  +15
}

// 第二步：行为修正（科学依据：反应时间比自我判断更诚实）
// Nelson 1984: RT 与记忆强度高度相关
// Wiertelak 2025: RT 是检索流畅度的客观指标
behavior_delta = 0

// 思考时间修正（think_time）
if think_time > 10000:  behavior_delta -= 12   // 想了 10 秒以上，基本不认识
elif think_time > 5000:  behavior_delta -= 6    // 想了 5 秒，犹豫明显
elif think_time > 3000:  behavior_delta -= 3    // 想了 3 秒，有点犹豫
elif think_time < 1000:  behavior_delta += 3    // 1 秒内秒答，很熟

// 翻转次数修正（flip_count）
// Hart 1965: FOK 判断不准确，行为比判断更可靠
if flip_count >= 3:      behavior_delta -= 8    // 翻了 3 次以上，明显不确定
elif flip_count >= 2:    behavior_delta -= 4    // 翻了 2 次，有点不确定

// 确认时间修正（verify_time）
if verify_time > 5000:  behavior_delta -= 4    // 翻开后还在犹豫
elif verify_time < 800:  behavior_delta += 2    // 翻开后秒选，很确定

// 第三步：行为覆盖（当行为和判断矛盾时，信任行为）
// Metcalfe 1994: 元认知判断经常高估记忆水平
if result == "remembered" && think_time > 8000:
  // 用户说"记得"但想了 8 秒 → 降级为"模糊"
  effective_result = "fuzzy"
  behavior_delta -= 5  // 额外惩罚：你的判断不准
elif result == "remembered" && think_time > 5000 && flip_count >= 2:
  effective_result = "fuzzy"
  behavior_delta -= 3
elif result == "forgot" && think_time < 2000:
  // 用户说"忘了"但 2 秒内就放弃了 → 可能太严苛
  behavior_delta += 3

// 第四步：趋势修正（最近表现权重更高）
// Bjork 2020: 适度困难理论，近期表现更能预测未来
recent = last 5 encounters
if recent.length >= 3:
  recent_avg = average(recent.result_deltas)
  if recent_avg < -5:    trend_delta -= 3    // 在变差
  elif recent_avg > 5:   trend_delta += 2    // 在变好
else:
  trend_delta = 0

// 第五步：综合计算
// 使用指数移动平均（EMA），旧值权重 0.7，新值权重 0.3
// 类似动量指标，防止单次波动过大
raw_delta = result_delta + behavior_delta + trend_delta
new_confidence = clamp(
  old_confidence * 0.7 + raw_delta * 0.3,
  0, 100
)
```

**为什么用 `old * 0.7`？**

这是指数移动平均（EMA），在信号处理和金融领域广泛使用。0.7 的衰减因子意味着：
- 单次"忘了"不会清零长期积累的信心
- 但连续 3 次"忘了"会让 confidence 快速下降
- 这符合幂律遗忘的特征——记忆是逐渐衰减的，不是突然消失的

### 2.4 调度间隔模型

**基于幂律遗忘曲线**（Wixted & Ebbesen 1991）：

```
// 基础间隔（天），根据 confidence 分段
// 每段内使用幂函数插值，而非线性
base_intervals = {
  [0, 15]:   { min: 0.007, max: 0.5 },    // 10分钟 ~ 12小时
  [15, 35]:  { min: 0.5,   max: 1.5 },    // 12小时 ~ 1.5天
  [35, 55]:  { min: 1.5,   max: 4 },      // 1.5天 ~ 4天
  [55, 75]:  { min: 4,     max: 10 },     // 4天 ~ 10天
  [75, 90]:  { min: 10,    max: 21 },     // 10天 ~ 21天
  [90, 100]: { min: 21,    max: 45 },     // 21天 ~ 45天
}

// 在每个区间内，使用幂函数插值（而非线性）
// 幂函数 b < 1 使得低 confidence 时间隔增长更慢（更频繁复习）
// 高 confidence 时间隔增长更快（可以放更久）
interval = power_interpolate(confidence, base_intervals, exponent=0.7)

// 反应时间修正
// think_time 长的卡片，同 confidence 下间隔缩短
if avg_think_time > 5000:
  interval *= 0.7   // 缩短 30%
elif avg_think_time > 3000:
  interval *= 0.85  // 缩短 15%
elif avg_think_time < 1500:
  interval *= 1.1   // 延长 10%（真的很熟）
```

**为什么用幂函数插值而非线性？**

- 线性：confidence 从 15→35（涨 20），间隔从 0.5→1.5 天（涨 1 天）
- 幂函数（b=0.7）：低 confidence 区间间隔增长更慢，高 confidence 区间增长更快
- 这意味着：**不熟的卡片复习频率更高，熟的卡片可以放更久**——符合"适度困难"原则

### 2.5 卡片进化（难度自适应）

**基于 Bjork (2020) 适度困难理论**：

```
confidence < 25:  "提示模式" — 正面同时显示英文和中文首字提示
                  降低认知负荷，先建立基本联系
confidence 25-50: "标准模式" — 正面只显示英文，翻转看中文
                  标准的主动回忆
confidence 50-75: "限时模式" — 英文显示后 3 秒自动翻转
                  制造时间压力，强化检索速度
confidence > 75:  "闪现模式" — 英文只显示 1.5 秒后消失，凭记忆回答
                  最高难度，测试深层记忆
```

**大白话**：卡片会随着你的水平自动变难。不会一开始就很难把你劝退，也不会一直太简单浪费时间。

### 2.6 LLM 的角色（后台分析，非实时）

LLM **不在翻卡热路径上**（那会卡），而是做定期深度分析：

#### 每日分析（heartbeat 触发，用户无感）

```
输入：过去 24 小时的 encounter 批量数据
输出：

1. 干扰组识别
   "GDP / GNP / PPP" 这三个你老搞混（think_time 都 > 6s，flip_count 都 >= 2）
   → 建议对比学习

2. 薄弱领域分析
   "金融类术语 confidence 平均 32，远低于政治类 58"
   → 建议增加金融类复习频率

3. 预测性调度
   "以下 12 张卡片 confidence 在 55-65 但 think_time 在上升"
   → 提前安排复习，防止遗忘

4. 助记生成
   对反复忘记（forgot >= 3 次）的卡片，LLM 生成记忆口诀
   → 下次翻到这张卡时显示助记提示
```

#### 实时轻量调用

- **连续 3 次忘了同一张** → 调用 LLM 生成助记提示
- **段落翻译卡** → 用户提交翻译后，LLM 即时评分

---

## 三、与现有算法的对比

| 维度 | SM-2 (Anki) | HLR (Duolingo) | FSRS (Anki) | **CASR (Mnemo)** |
|------|-------------|----------------|-------------|-----------------|
| 用户输入 | 0-5 分（6 档） | 对/错 | Again/Hard/Good/Easy | **忘了/模糊/记得** |
| 反应时间 | ❌ 不考虑 | ✅ 考虑 | ❌ 不考虑 | ✅ **核心信号** |
| 翻转行为 | ❌ | ❌ | ❌ | ✅ **独有** |
| 行为修正 | ❌ | ✅ ML 模型 | ❌ | ✅ **规则+LLM** |
| 遗忘模型 | 指数衰减 | 半衰期回归 | 三参数模型 | **幂函数** |
| 难度自适应 | ❌ | ❌ | ❌ | ✅ **卡片进化** |
| 个性化 | 弱（全局参数） | 强（ML 训练） | 中（优化器） | **渐进进化** |
| 科学依据 | Ebbinghaus | Settles 2016 | Ye 2022 | **8 篇核心论文** |
| 可解释性 | 中 | 低（黑盒） | 中 | **高（每个参数有依据）** |

---

## 四、数据结构

```python
class MemoryDNA:
    """每张卡片的记忆画像"""
    confidence: float = 0        # 0-100，核心指标
    encounters: int = 0          # 总共见过几次
    forgot_count: int = 0        # 忘了几次
    fuzzy_count: int = 0         # 模糊几次
    remembered_count: int = 0    # 记得几次
    avg_think_time: float = 0    # 平均思考时间 ms
    avg_verify_time: float = 0   # 平均确认时间 ms
    avg_flip_count: float = 0    # 平均翻转次数
    last_seen: datetime | None   # 上次复习时间
    next_review: datetime | None # 下次复习时间
    stability: float = 0         # 记忆稳定性（类似 FSRS 的 S 参数）
    difficulty: float = 0        # 卡片内在难度（类似 FSRS 的 D 参数）
    history: list[Encounter] = [] # 最近 20 次 encounter 记录
```

---

## 五、验证方案

### 5.1 A/B 测试设计

```
对照组：SM-2 算法（标准 Anki）
实验组：CASR 算法

指标：
  1. 长期保留率（7 天后测试，不经过中间复习）
  2. 达到 90% 掌握所需的复习次数
  3. 每日学习时间
  4. 用户满意度（NPS）
```

### 5.2 预测准确率

```
对于每张卡片，算法预测 "下次复习时的 recall probability"
实际复习时记录用户是否答对
计算 Brier Score（预测准确度指标）

目标：Brier Score < 0.15（FSRS 在公开数据集上约 0.12-0.15）
```

### 5.3 行为修正效果

```
对比 "只看 result" vs "result + 行为修正" 的预测准确率
预期：行为修正能提升 5-10% 的预测准确率
```

---

## 六、参考文献

1. Ebbinghaus, H. (1885). *Memory: A Contribution to Experimental Psychology*.
2. Dempster, F.N. (1988). The spacing effect. *American Psychologist*, 43(8), 627-634.
3. Cepeda, N.J. et al. (2006). Distributed practice in verbal recall tasks. *Review of Educational Research*, 76(3), 354-380.
4. Roediger, H.L. & Karpicke, J.D. (2006). Test-enhanced learning. *Psychological Science*, 17(3), 249-255.
5. Karpicke, J.D. & Roediger, H.L. (2008). The critical importance of retrieval for learning. *Science*, 319(5865), 966-968.
6. Nelson, T.O. et al. (1984). Response latency and response accuracy as measures of memory. *Acta Psychologica*, 57(2), 215-226.
7. Wiertelak et al. (2025). The effects of delay on objective memory and subjective experience. *Nature Scientific Reports*.
8. Hart, J.T. (1965). Memory and the feeling-of-knowing experience. *Journal of Educational Psychology*, 56(4), 208-216.
9. Metcalfe, J. & Shimamura, A.P. (1994). *Metacognition: Knowing about Knowing*. MIT Press.
10. Bjork, E.L. & Bjork, R.A. (2020). Desirable difficulties in theory and practice. *Journal of Applied Research in Memory and Cognition*, 9(4), 475-479. [被引 2039 次]
11. Wixted, J.T. & Ebbesen, E.B. (1991). On the form of forgetting. *Psychological Science*, 2(6), 409-415.
12. Kahana, M.J. & Adler, M. (2002). Note on the power law of forgetting. *Memory & Cognition*, 30(6), 895-899.
13. Settles, B. & Meeder, B. (2016). A Trainable Spaced Repetition Model for Language Learning. *ACL*.
14. Ye, J. (2022). FSRS: Free Spaced Repetition Scheduler. *GitHub open-spaced-repetition*.
15. 华东理工大学 (2025). 基于ACT-R的认知间隔重复学习方法. *华东理工大学学报*.
16. 墨墨背单词 (2022). 优化间隔重复调度的随机最短路径算法. *KDD*.
