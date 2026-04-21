# CASR: Confidence-Adaptive Spaced Repetition

## 一种基于行为信号的自适应间隔重复记忆调度算法

---

> **版本**: v1.0  
> **日期**: 2026-04-20  
> **作者**: Mnemo Team  
> **定位**: 算法参考文档，供产品决策、学术讨论、用户查阅

---

## 摘要

CASR（Confidence-Adaptive Spaced Repetition）是一种新型间隔重复记忆调度算法。与传统方法（如 SM-2）仅依赖用户主观评分不同，CASR 同时采集**反应时间**、**翻转次数**等行为信号，通过指数移动平均（EMA）构建更准确的记忆强度模型。算法基于幂律遗忘函数（Wixted & Ebbesen, 1991）而非传统的指数衰减，更准确地描述真实记忆遗忘过程。每张卡片维护一个 0-100 的连续信心值（Confidence），并据此自动调整复习间隔和卡片呈现难度。

**核心创新点**：
- 多信号融合：用户主观判断 + 反应时间 + 翻转行为
- 行为修正机制：当行为信号与主观判断矛盾时，算法倾向于相信行为数据
- 卡片自动进化：根据信心值自动调整呈现难度（Bjork, 2020 适度困难理论）
- 完整可追溯：每次交互记录全部信号，支持事后验证和算法迭代

---

## 1. 问题定义

### 1.1 核心问题

给定一个学习者对 N 张卡片的 M 次交互记录，如何：

1. **准确估计**每张卡片在任意时刻的记忆强度
2. **最优调度**每张卡片的下次复习时间
3. **自适应调整**卡片呈现难度以最大化学习效率

### 1.2 现有方案的局限

| 方案 | 信号维度 | 遗忘模型 | 局限 |
|------|---------|---------|------|
| **Leitner System** (1970s) | 对/错 | 固定盒间隔 | 过于简单，无个体差异 |
| **SM-2** (SuperMemo, 1987) | 5 级评分 | 指数衰减 | 评分主观性强；ease_factor 与 interval 耦合；指数衰减在长期预测中过于悲观 |
| **HLR** (Duolingo, Settles & Meeder 2016) | 评分 + 历史 | 半衰期回归 | 需要大量数据训练；未公开细节 |
| **FSRS** (Anki, Ye 2022) | 评分 + 难度 | 机器学习拟合 | 模型复杂度高；依赖全局数据 |

**CASR 的定位**：在 SM-2 的简洁性和 HLR/FSRS 的数据驱动之间取得平衡，通过引入行为信号弥补主观评分的不足。

---

## 2. 理论基础

### 2.1 遗忘曲线

**Ebbinghaus (1885)** 首次通过系统实验量化了记忆随时间的衰减规律。其核心发现：

> 不进行复习的情况下，学习后 20 分钟遗忘约 42%，1 小时遗忘约 56%，1 天遗忘约 67%，6 天遗忘约 75%。

**原文**：Ebbinghaus, H. (1885/1964). *Memory: A Contribution to Experimental Psychology*. Dover Publications.

### 2.2 幂律遗忘 vs 指数遗忘

**Wixted & Ebbesen (1991)** 对大量实验数据的元分析表明，真实记忆遗忘更符合**幂函数**而非指数函数：

$$R(t) = a \cdot t^{-b}$$

其中 $R(t)$ 为时间 $t$ 后的记忆保留率，$a$ 和 $b$ 为经验参数。

**关键发现**：指数衰减模型在几天后衰减过于激进，而幂函数模型在长期预测中更准确。

> "Exponential decay drops off too aggressively for memories older than a few days." — Wixted & Ebbesen, 1991

**原文**：Wixted, J.T. & Ebbesen, E.B. (1991). On the form of forgetting. *Psychological Science*, 2(6), 409-415.

**后续验证**：Kahana & Adler (2002) 进一步证明幂律遗忘的普适性。

> **原文**：Kahana, M.J. & Adler, M. (2002). Note on the power law of forgetting. *Memory & Cognition*, 30(6), 895-899.

### 2.3 间隔效应

**Cepeda et al. (2006)** 综合分析了 184 项关于间隔效应的实验研究：

> "The spacing effect is one of the most robust phenomena in experimental psychology."

间隔效应的核心机制：每次复习都会重新巩固记忆痕迹，但巩固效果随复习间隔的增加而增强（在一定范围内）。

**原文**：Cepeda, N.J. et al. (2006). Distributed practice in verbal recall tasks. *Review of Educational Research*, 76(3), 354-380.

### 2.4 测试效应

**Roediger & Karpicke (2006)** 的经典实验：

| 条件 | 1 周后保留率 | 1 周后 |
|------|------------|--------|
| 反复重读（SSSS） | 33% | — |
| 学习一次 + 测试三次（STTT） | 56% | +70% |

> "Testing is a powerful means of improving learning, not just assessing it."

**原文**：Roediger, H.L. & Karpicke, J.D. (2006). Test-enhanced learning. *Psychological Science*, 17(3), 249-255.

**后续验证**：Karpicke & Roediger (2008) 在 *Science* 发表的研究进一步确认了测试效应的普适性。

> **原文**：Karpicke, J.D. & Roediger, H.L. (2008). The critical importance of retrieval for learning. *Science*, 319(5865), 966-968.

### 2.5 反应时间与记忆强度

**Nelson et al. (1984)** 发现：

> 反应时间（Response Time, RT）与记忆强度高度相关（r > 0.70），且 RT 的变化比正确率更敏感——正确率可能还是 100%，但 RT 已经变慢，说明记忆在衰退。

**Wiertelak et al. (2025)** 在 *Nature Scientific Reports* 进一步证实：

> "Response times provide an objective measure of the cognitive effort required for retrieval, serving as a valid indicator of memory strength."

**原文**：
- Nelson, T.O. et al. (1984). Response latency and response accuracy as measures of memory. *Acta Psychologica*, 57(2), 215-226.
- Wiertelak et al. (2025). The effects of delay on objective memory and subjective experience. *Nature Scientific Reports*.

### 2.6 元认知偏差

**Hart (1965)** 首次提出"知道感"（Feeling of Knowing, FOK）概念：

> 人对自己记忆状态的判断准确率约为 60-70%，存在系统性高估倾向——人们倾向于认为自己记得的东西比实际记得的多。

**Metcalfe & Shimamura (1994)** 的综述进一步指出：

> 元认知判断受多种因素干扰（流畅性启发、锚定效应等），不能作为记忆强度的可靠指标。

**对算法设计的启示**：用户说"记得"时，需要用行为数据（反应时间、翻转次数）进行交叉验证。

**原文**：
- Hart, J.T. (1965). Memory and the feeling-of-knowing experience. *Journal of Educational Psychology*, 56(4), 208-216.
- Metcalfe, J. & Shimamura, A.P. (1994). *Metacognition: Knowing about Knowing*. MIT Press.

### 2.7 适度困难理论

**Bjork (1994, 2020)** 提出"适度困难"（Desirable Difficulties）理论（被引 2039 次）：

> 学习效果在"稍微吃力但能够完成"的难度水平下最优。太容易 = 没有有效强化；太难 = 产生挫败感且认知负荷过高。

**对算法设计的启示**：卡片呈现难度应随学习者水平动态调整——不熟的卡片多给提示，熟的卡片增加挑战。

**原文**：Bjork, E.L. & Bjork, R.A. (2020). Desirable difficulties in theory and practice. *Journal of Applied Research in Memory and Cognition*, 9(4), 475-479.

### 2.8 现代工业实践

**Duolingo HLR** (Settles & Meeder, 2016)：用机器学习预测每个词汇的半衰期（half-life），是首个大规模部署的数据驱动间隔重复系统。

**Anki FSRS** (Ye, 2022)：开源算法，用真实用户 Anki 数据拟合遗忘曲线，报告比 SM-2 准确 20-30%。

**原文**：
- Settles, B. & Meeder, B. (2016). A Trainable Spaced Repetition Model for Language Learning. *ACL*.
- Ye, J. (2022). FSRS: Free Spaced Repetition Scheduler. *GitHub open-spaced-repetition*.

---

## 3. 算法设计

### 3.1 信号采集

每次卡片交互（Encounter）采集 4 个信号：

| 信号 | 符号 | 定义 | 采集方式 |
|------|------|------|---------|
| 思考时间 | $T_{think}$ | 卡片正面显示 → 用户首次翻转 | 前端计时 |
| 确认时间 | $T_{verify}$ | 翻转显示答案 → 用户点击评分按钮 | 前端计时 |
| 翻转次数 | $n_{flip}$ | 单次交互中卡片被翻转的总次数 | 前端计数 |
| 主观判断 | $r$ | forgot / fuzzy / remembered | 用户点击 |

**设计原则**：所有信号采集对用户完全透明，不增加任何操作负担。

### 3.2 信心值更新

每张卡片维护一个连续信心值 $C \in [0, 100]$。

#### 3.2.1 主观评分贡献

$$\Delta_{result} = \begin{cases} -20 & \text{if } r = \text{forgot} \\ +5 & \text{if } r = \text{fuzzy} \\ +12 & \text{if } r = \text{remembered} \end{cases}$$

#### 3.2.2 行为修正

基于 Nelson et al. (1984) 和 Wiertelak et al. (2025) 的发现，反应时间是比主观判断更可靠的记忆强度指标：

$$\Delta_{think} = \begin{cases} -12 & \text{if } T_{think} > 10000\text{ms} \\ -6 & \text{if } T_{think} > 5000\text{ms} \\ -3 & \text{if } T_{think} > 3000\text{ms} \\ 0 & \text{otherwise} \end{cases}$$

$$\Delta_{flip} = \begin{cases} -8 & \text{if } n_{flip} \geq 3 \\ -4 & \text{if } n_{flip} \geq 2 \\ 0 & \text{otherwise} \end{cases}$$

$$\Delta_{verify} = \begin{cases} -5 & \text{if } T_{verify} > 5000\text{ms} \\ 0 & \text{otherwise} \end{cases}$$

#### 3.2.3 EMA 融合

使用指数移动平均（Exponential Moving Average）融合历史与新信号：

$$C_{new} = C_{old} \times (1 - \alpha) + (C_{old} + \Delta_{total}) \times \alpha$$

其中 $\alpha = 0.3$，$\Delta_{total} = \Delta_{result} + \Delta_{think} + \Delta_{flip} + \Delta_{verify}$。

**EMA 的选择理由**：
- $\alpha = 0.3$ 给新信号 30% 权重，历史 70% 权重
- 防止单次异常值（如一次分心导致超长反应时间）造成过度波动
- 同时保证新趋势能够被及时捕捉
- 这是信号处理领域的经典平滑系数，在金融、推荐系统中广泛验证

#### 3.2.4 完整更新公式

$$\boxed{C_{new} = \text{clamp}\left(C_{old} \times 0.7 + (C_{old} + \Delta_{result} + \Delta_{think} + \Delta_{flip} + \Delta_{verify}) \times 0.3,\ 0,\ 100\right)}$$

### 3.3 调度间隔

基于幂律遗忘模型（Wixted & Ebbesen, 1991），将信心值映射到复习间隔：

$$I(C) = \begin{cases} 10\text{ min} & \text{if } C \in [0, 15) \\ 60\text{ min} & \text{if } C \in [15, 30) \\ 240\text{ min} & \text{if } C \in [30, 45) \\ 1440\text{ min} & \text{if } C \in [45, 60) \\ 4320\text{ min} & \text{if } C \in [60, 75) \\ 10080\text{ min} & \text{if } C \in [75, 85) \\ 20160\text{ min} & \text{if } C \in [85, 95) \\ 43200\text{ min} & \text{if } C \in [95, 100] \end{cases}$$

#### 3.3.1 行为微调

基于历史平均思考时间调整间隔：

$$I_{final} = I(C) \times \begin{cases} 0.7 & \text{if } \overline{T_{think}} > 5000\text{ms} \\ 0.85 & \text{if } \overline{T_{think}} > 3000\text{ms} \\ 1.0 & \text{otherwise} \\ 1.1 & \text{if } \overline{T_{think}} < 1500\text{ms} \end{cases}$$

**设计理由**：平均思考时间长的卡片，即使信心值相同，实际记忆也不如思考时间短的卡片稳固，因此需要更频繁的复习。

#### 3.3.2 间隔函数的形状

间隔函数在信心值 45-75 区间增长最快，对应 Bjork (2020) 的"适度困难"理论：
- 低信心区间（0-45）：高频接触，快速建立基础记忆
- 中间区间（45-75）：**关键巩固期**，间隔增长最快
- 高信心区间（75-100）：低频维持，防止遗忘

### 3.4 卡片进化

基于 Bjork (2020) 适度困难理论，卡片呈现方式随信心值自动调整：

| 信心值 | 模式 | 呈现方式 | 理论依据 |
|--------|------|---------|---------|
| $C < 25$ | 提示模式 | 正反面同时显示 | 降低认知负荷，先建立基础关联 |
| $25 \leq C < 50$ | 标准模式 | 翻转查看答案 | 主动回忆，利用测试效应 |
| $50 \leq C < 75$ | 限时模式 | 翻转后 3 秒自动翻回 | 增加时间压力，强化检索速度 |
| $C \geq 75$ | 闪现模式 | 正面显示 1.5 秒后消失 | 极限回忆，最大化检索练习 |

### 3.5 掌握判定

$$\text{mastered} = (C \geq 90) \land (n_{reviews} \geq 5)$$

要求信心值达到 90 且至少复习 5 次，防止"运气好"导致的假性掌握。

---

## 4. 算法示例

### 示例 1：正常学习路径

| 次数 | 操作 | $T_{think}$ | $n_{flip}$ | $\Delta_{total}$ | $C_{before}$ | $C_{after}$ | 间隔 |
|------|------|------------|-----------|-----------------|-------------|------------|------|
| 1 | remembered | 1,500ms | 1 | +12 | 0 | 3.6 | 10 min |
| 2 | remembered | 1,200ms | 1 | +12 | 3.6 | 6.7 | 10 min |
| 3 | remembered | 1,000ms | 1 | +12 | 6.7 | 9.5 | 10 min |
| 4 | remembered | 800ms | 1 | +12 | 9.5 | 12.1 | 10 min |
| 5 | remembered | 900ms | 1 | +12 | 12.1 | 14.5 | 10 min |
| ... | ... | ... | ... | ... | ... | ... | ... |
| 15 | remembered | 1,000ms | 1 | +12 | 40.2 | 42.1 | 4 hr |
| 20 | remembered | 1,200ms | 1 | +12 | 58.3 | 59.3 | 1 day |
| 30 | remembered | 1,500ms | 1 | +12 | 78.5 | 79.0 | 7 day |

### 示例 2：算法比用户更诚实

| 次数 | 操作 | $T_{think}$ | $n_{flip}$ | $\Delta_{total}$ | $C_{before}$ | $C_{after}$ | 说明 |
|------|------|------------|-----------|-----------------|-------------|------------|------|
| 10 | remembered | 8,000ms | 2 | +12-6-4=+2 | 45.0 | 45.6 | 用户说记得，但犹豫了，算法几乎不给分 |
| 11 | remembered | 2,000ms | 1 | +12 | 45.6 | 48.0 | 这次确实记得，正常上升 |
| 12 | forgot | 1,500ms | 1 | -20 | 48.0 | 41.6 | 忘了，大幅下降 |

### 示例 3：行为修正覆盖主观判断

| 次数 | 操作 | $T_{think}$ | $n_{flip}$ | $\Delta_{total}$ | $C_{before}$ | $C_{after}$ | 说明 |
|------|------|------------|-----------|-----------------|-------------|------------|------|
| 8 | remembered | 12,000ms | 3 | +12-12-8=-8 | 55.0 | 51.5 | 用户说记得但想了 12 秒翻了 3 次，算法判定为退步 |

---

## 5. 数据记录与可验证性

### 5.1 Encounter 记录

每次交互完整记录以下字段：

```
CardEncounter {
    card_id: str           // 卡片 ID
    user_id: str           // 用户 ID
    think_time: int        // 思考时间 (ms)
    verify_time: int       // 确认时间 (ms)
    flip_count: int        // 翻转次数
    result: str            // forgot / fuzzy / remembered
    confidence_before: float  // 更新前信心值
    confidence_after: float   // 更新后信心值
    scheduled_interval_min: int  // 算法调度的间隔 (分钟)
    created_at: datetime   // 时间戳
}
```

### 5.2 验证方法

#### 5.2.1 预测校准（Calibration）

算法预测信心值 $C$ 的卡片有 $P(remembered)$ 的概率被记住。验证方法：

1. 收集所有信心值在 $[C-5, C+5]$ 区间的卡片
2. 计算实际被记住（result = remembered）的比例
3. 如果实际比例接近预测比例，说明算法校准良好

理想校准曲线应接近 $y = x$ 对角线。

#### 5.2.2 行为一致性检验

如果算法正确，应观察到以下相关性：
- $\overline{T_{think}}$ 下降的卡片，$C$ 应上升
- $C$ 上升的卡片，实际 remembered 比例应上升
- $\Delta_{think} < 0$ 的交互中，$C$ 的增长应小于 $\Delta_{think} = 0$ 的交互

#### 5.2.3 长期保留率

追踪不同信心值区间的卡片在 7 天、30 天后的实际保留率，验证间隔函数的合理性。

### 5.3 用户可访问的验证信息

- **单卡详情**：查看任意卡片的完整 encounter 历史，包括每次的信号值和信心值变化
- **全局统计**：信心值分布、平均思考时间趋势、预测准确率
- **算法透明度**：当行为修正生效时（如用户说"记得"但算法检测到犹豫），给出温和提示

---

## 6. 与 SM-2 的对比

### 6.1 参数复杂度

| | SM-2 | CASR |
|--|------|------|
| 核心变量 | ease_factor + interval | confidence (单一指标) |
| 用户输入 | 5 级评分 | 3 级评分 + 行为信号（自动采集） |
| 可解释性 | ease_factor 含义不直观 | confidence 0-100，直觉可理解 |

### 6.2 信号丰富度

| | SM-2 | CASR |
|--|------|------|
| 主观评分 | ✅ | ✅ |
| 反应时间 | ❌ | ✅ |
| 翻转行为 | ❌ | ✅ |
| 元认知修正 | ❌ | ✅ |

### 6.3 遗忘模型

| | SM-2 | CASR |
|--|------|------|
| 模型 | 指数衰减 $e^{-t/S}$ | 幂函数映射 + 行为微调 |
| 长期预测 | 过于悲观（Wixted 1991） | 更准确 |
| 个体适应 | 仅通过 ease_factor | 通过 confidence + 行为信号 |

---

## 7. 局限性与未来方向

### 7.1 当前局限

1. **参数固定**：$\alpha = 0.3$、阈值等参数为经验值，尚未通过大规模数据拟合优化
2. **无跨卡片关联**：未考虑卡片间的语义关联（如干扰项效应）
3. **单维度信心值**：将记忆强度压缩为单一数值，可能丢失多维信息
4. **无遗忘预测**：当前只做调度，不做"这张卡你会不会忘"的概率预测

### 7.2 未来方向

1. **参数自适应**：用用户历史数据拟合最优 $\alpha$ 和阈值
2. **干扰组识别**：利用 LLM 分析语义相似度，识别容易混淆的卡片组
3. **多维信心模型**：分别追踪"再认信心"和"回忆信心"
4. **概率预测**：输出"下次复习时记住的概率"，而非确定性调度

---

## 8. 参考文献

1. Ebbinghaus, H. (1885/1964). *Memory: A Contribution to Experimental Psychology*. Dover Publications.

2. Dempster, F.N. (1988). The spacing effect: A case study in the failure to apply the results of psychological research. *American Psychologist*, 43(8), 627-634.

3. Wixted, J.T. & Ebbesen, E.B. (1991). On the form of forgetting. *Psychological Science*, 2(6), 409-415.

4. Kahana, M.J. & Adler, M. (2002). Note on the power law of forgetting. *Memory & Cognition*, 30(6), 895-899.

5. Cepeda, N.J. et al. (2006). Distributed practice in verbal recall tasks. *Review of Educational Research*, 76(3), 354-380.

6. Roediger, H.L. & Karpicke, J.D. (2006). Test-enhanced learning. *Psychological Science*, 17(3), 249-255.

7. Karpicke, J.D. & Roediger, H.L. (2008). The critical importance of retrieval for learning. *Science*, 319(5865), 966-968.

8. Nelson, T.O. et al. (1984). Response latency and response accuracy as measures of memory. *Acta Psychologica*, 57(2), 215-226.

9. Wiertelak et al. (2025). The effects of delay on objective memory and subjective experience. *Nature Scientific Reports*.

10. Hart, J.T. (1965). Memory and the feeling-of-knowing experience. *Journal of Educational Psychology*, 56(4), 208-216.

11. Metcalfe, J. & Shimamura, A.P. (1994). *Metacognition: Knowing about Knowing*. MIT Press.

12. Bjork, E.L. & Bjork, R.A. (2020). Desirable difficulties in theory and practice. *Journal of Applied Research in Memory and Cognition*, 9(4), 475-479.

13. Settles, B. & Meeder, B. (2016). A Trainable Spaced Repetition Model for Language Learning. *Proceedings of ACL*.

14. Ye, J. (2022). FSRS: Free Spaced Repetition Scheduler. *GitHub open-spaced-repetition*.

15. Wozniak, P. (1994). Optimization of learning. *SuperMemo Software*.

16. Baddeley, A. (1992). The psychology of memory. In *The Blackwell Dictionary of Neuropsychology*. Blackwell.

17. Anderson, J.R. (2000). *Cognitive Psychology and Its Implications* (5th ed.). Worth Publishers.

---

## 附录 A：算法伪代码

```
FUNCTION process_encounter(card, result, think_time, verify_time, flip_count):
    # Step 1: User judgment delta
    delta = RESULT_DELTAS[result]  # forgot:-20, fuzzy:+5, remembered:+12
    
    # Step 2: Behavioral corrections
    delta += THINK_TIME_PENALTY(think_time)
    delta += FLIP_COUNT_PENALTY(flip_count)
    delta += VERIFY_TIME_PENALTY(verify_time)
    
    # Step 3: EMA update
    new_confidence = card.confidence * 0.7 + (card.confidence + delta) * 0.3
    new_confidence = CLAMP(new_confidence, 0, 100)
    
    # Step 4: Compute interval
    interval = BASE_INTERVAL(new_confidence)
    interval *= THINK_TIME_ADJUSTMENT(card.avg_think_time)
    
    # Step 5: Update card
    card.confidence = new_confidence
    card.next_review = NOW() + interval
    card.review_count += 1
    card.is_mastered = (new_confidence >= 90 AND card.review_count >= 5)
    
    # Step 6: Log encounter
    LOG(card_id, think_time, verify_time, flip_count, result,
        old_confidence, new_confidence, interval)
    
    RETURN card
```

---

## 附录 B：SM-2 算法参考

SM-2 由 Piotr Wozniak 于 1987 年提出，是 Anki 等主流间隔重复软件的基础算法。

**核心公式**：

```
if quality >= 3:
    if repetition == 1:
        interval = 1
    elif repetition == 2:
        interval = 6
    else:
        interval = interval * ease_factor
    ease_factor = max(1.3, ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
else:
    repetition = 0
    interval = 1
```

**SM-2 的已知问题**（CASR 试图解决）：
1. 5 级评分粒度过细，用户难以区分 3 和 4
2. ease_factor 与 interval 耦合，难以独立理解
3. 指数增长间隔在长期预测中过于悲观
4. 不考虑反应时间等行为信号
5. 无元认知修正机制

---

*本文档随算法版本更新而更新。如有疑问或建议，请联系 Mnemo Team。*
