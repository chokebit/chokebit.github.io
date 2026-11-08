---
title: Quant + AI Quant 学习路线图（完整版）
lang: cn
description: 0 基础自学量化投资的完整路线图：12 个 Stage、每个 Stage 的目标、知识点清单和阶段产出。空白版，可复制去自己打勾。学习记录，非投资建议。
created: 2026-10-25
modified: 2026-10-25
tags:
  - quant
  - roadmap
  - learning
---

> 这是我自学量化的完整路线图，**空白版**，可以复制去自己打勾。为什么这样排、怎么用 AI 学，见[[quant/quant-learning-roadmap.cn|连载开篇]]；也可以打开<a href="./lab.html" data-router-ignore>交互路线图</a>。学习记录，非投资建议。

> 最终目标：**具备独立投资能力 + 量化研究能力 + Python/数据工程能力 + AI
> 辅助量化系统构建能力**，能够从"投资假设"走到"回测、验证、小资金实盘、复盘"，并逐步把研究流程AI 化。
>
> 使用方式：按阶段推进，每完成一个知识点就打勾。**不要追求一次学完所有内容**；路线图是地图，不是课程目录。
>
> 教学约束：后续学习按本路线推进，避免跳跃；每次最多引入 **3
> 个新概念**。每节课会明确"当前位置、当前节点、今天学什么、学完什么"。

---
## 0. 总体路线

```text
投资基础
   ↓
Python / 数据
   ↓
概率 / 统计
   ↓
Quant Fundamentals
   ↓
信号 / 因子
   ↓
Backtesting
   ↓
防止回测造假
   ↓
Portfolio / Risk
   ↓
小资金实盘
   ↓
AI Quant Research System
```

最终形成：

```text
投资假设
   ↓
数据
   ↓
研究
   ↓
策略
   ↓
回测
   ↓
样本外验证
   ↓
风险分析
   ↓
Paper Trading
   ↓
Small Capital Live
   ↓
复盘
   ↓
AI 自动化研究
```

---
# Stage 0：Python、数据与工程基础

## 目的

让你能够**自己处理金融数据，而不是依赖别人已经写好的分析结果**。

量化投资的底层不是"指标"，而是数据和程序。

如果这一阶段不过关，后面的回测、因子和 AI
都容易变成"会调用工具但不知道结果是否正确"。

## 阶段目标

完成后，你应该能够：

-   获取股票历史数据
-   看懂 DataFrame
-   清洗数据
-   计算指标
-   画图
-   编写简单的数据处理程序
-   阅读和修改量化代码
-   使用 Git 管理自己的研究代码

## 0.1 Python 基础

- [ ] 变量
- [ ] List
- [ ] `for`
- [ ] 函数
- [ ] Dictionary
- [ ] Tuple
- [ ] Set
- [ ] 条件判断
- [ ] 异常处理
- [ ] Module / Package
- [ ] 文件读写
- [ ] 虚拟环境
- [ ] Git 基础

## 0.2 NumPy

- [ ] Array
- [ ] Vectorized Operation
- [ ] Boolean Indexing
- [ ] 基础统计计算

## 0.3 Pandas

- [ ] DataFrame
- [ ] Series（已接触，后续正式掌握）
- [ ] Column
- [ ] Index
- [ ] MultiIndex
- [ ] `droplevel()`
- [ ] `loc`
- [ ] `iloc`
- [ ] Filtering
- [ ] Sorting
- [ ] `groupby`
- [ ] `merge`
- [ ] `concat`
- [ ] `shift`
- [ ] `rolling`
- [ ] `resample`
- [ ] Missing Data
- [ ] Datetime

## 0.4 Visualization

- [ ] Matplotlib
- [ ] Line Chart
- [ ] Candlestick
- [ ] Equity Curve
- [ ] Drawdown Curve

### 阶段产出

一个可以运行的 Python Notebook / 项目：

```text
AAPL 数据
→ 清洗
→ 收益率
→ 指标
→ 图表
```

### 这个阶段真的有用吗？

**非常有用，属于必修。**

它不是为了让你成为 Python
开发者，而是让你拥有"自己验证数据和想法"的能力。

---
# Stage 1：金融市场与股票数据基础

## 目的

建立"市场语言"。

你需要知道每一个数字到底代表什么，否则很容易把一个看似合理的回测建立在错误的数据上。

## 阶段目标

看到一份股票行情数据，你能够解释：

> 每一列是什么、价格为什么会变化、公司行为为什么会改变历史数据、交易为什么存在成本。

## 1.1 股票市场

- [ ] Stock
- [ ] Share
- [ ] Market Cap
- [ ] Outstanding Shares
- [ ] Float
- [ ] Exchange
- [ ] Ticker

## 1.2 股票价格

- [ ] Open
- [ ] High
- [ ] Low
- [ ] Close
- [ ] Volume
- [ ] Raw Close
- [ ] Adjusted Close
- [ ] Corporate Actions
- [ ] Bid
- [ ] Ask
- [ ] Bid-Ask Spread
- [ ] Liquidity

## 1.3 公司行为

- [ ] Stock Split
- [ ] Reverse Split
- [ ] Dividend
- [ ] Buyback
- [ ] Stock Issuance

## 1.4 交易

- [ ] Market Order
- [ ] Limit Order
- [ ] Stop Order
- [ ] Short Selling
- [ ] Margin
- [ ] Settlement

### 阶段产出

能够：

1.  获取可靠的历史行情。
2.  区分 Raw Price 与 Adjusted Price。
3.  理解分红、拆股对历史价格和收益计算的影响。
4.  理解真实交易和"理论价格"的区别。

### 这个阶段真的有用吗？

**非常有用，属于必修。**

尤其是 Adjusted
Price、公司行为、Bid/Ask、Liquidity，会直接影响后面的收益计算和回测真实性。

---
# Stage 2：基本面投资分析

## 目的

让你先成为一个**懂企业的投资者**，而不只是"会跑策略的人"。

量化并不意味着完全不需要理解公司。

尤其是你的最终目标是 AI 辅助量化，AI
最适合帮助你处理大量公司信息，而你必须知道这些信息为什么重要。

## 阶段目标

给你 AAPL / MSFT / NVDA 等公司，你能够自己回答：

> 这家公司怎么赚钱？增长来自哪里？利润质量如何？资产负债是否健康？市场给它什么估值？主要风险是什么？

## 2.1 财务报表

- [ ] Income Statement
- [ ] Balance Sheet
- [ ] Cash Flow Statement
- [ ] Revenue
- [ ] Gross Profit
- [ ] Operating Income
- [ ] Net Income
- [ ] EPS
- [ ] Free Cash Flow

## 2.2 财务指标

- [ ] Gross Margin
- [ ] Operating Margin
- [ ] Net Margin
- [ ] ROE
- [ ] ROIC
- [ ] Debt / Equity
- [ ] Current Ratio

## 2.3 估值

- [ ] P/E
- [ ] Forward P/E
- [ ] P/S
- [ ] P/B
- [ ] Enterprise Value
- [ ] EV/EBITDA
- [ ] FCF Yield
- [ ] DCF

## 2.4 公司研究

- [ ] Business Model
- [ ] Competitive Advantage
- [ ] Moat
- [ ] Management
- [ ] Industry
- [ ] TAM
- [ ] Growth
- [ ] Risks
- [ ] Investment Thesis

### 阶段产出

写出第一份完整的公司研究报告：

```text
公司
→ 商业模式
→ 财务状况
→ 增长
→ 估值
→ 竞争优势
→ 风险
→ Investment Thesis
```

### 这个阶段真的有用吗？

**有用，但不需要一开始学到专业 CFA 深度。**

你的目标是投资和 AI Quant，不是成为传统证券研究员。

这里优先掌握"看懂公司和财务数据"的能力，避免把大量时间花在暂时用不到的细枝末节。

---
# Stage 3：概率、统计与金融数学基础

## 目的

让你能够判断：

> "这个策略赚钱"到底是有规律，还是只是随机结果。

这是量化研究的核心分水岭。

## 阶段目标

能够理解：

-   收益为什么有随机性
-   风险如何衡量
-   两个变量是否相关
-   一个结果是否具有统计意义
-   回归结果应该如何解释

## 3.1 概率

- [ ] Probability
- [ ] Conditional Probability
- [ ] Expected Value
- [ ] Random Variable
- [ ] Distribution

## 3.2 描述统计

- [ ] Mean
- [ ] Median
- [ ] Variance
- [ ] Standard Deviation
- [ ] Percentile
- [ ] Z-score

## 3.3 相关性

- [ ] Covariance
- [ ] Correlation
- [ ] Correlation Matrix

## 3.4 统计推断

- [ ] Sampling
- [ ] Population
- [ ] Hypothesis Testing
- [ ] p-value
- [ ] Confidence Interval
- [ ] Statistical Significance

## 3.5 回归

- [ ] Linear Regression
- [ ] OLS
- [ ] Residual
- [ ] R²
- [ ] Regression Coefficient

## 3.6 后续数学基础

这些不是现在学，但进入高级量化时需要：

- [ ] Linear Algebra
- [ ] Calculus
- [ ] Optimization
- [ ] Time Series
- [ ] Stochastic Processes
- [ ] Stochastic Calculus（高级方向）

### 阶段产出

能够对一个策略提出：

> "这个结果的统计证据是什么？"

而不是只看收益曲线。

### 这个阶段真的有用吗？

**非常有用。**

但要注意：

**现在不需要为了"量化"先学一整套高等数学。**

先学能直接用于数据分析和策略验证的概率统计；高级数学在进入更复杂的 Quant
Research 后再补。

---
# Stage 4：Quant Fundamentals

## 目的

开始真正理解"量化投资是如何衡量收益和风险的"。

## 阶段目标

给你一个策略，你能够回答：

> 赚了多少？ 波动多大？ 最大亏损是多少？ 是否跑赢市场？
> 承担单位风险获得了多少收益？

## 4.1 Return

- [ ] Simple Return
- [ ] Log Return
- [ ] Cumulative Return
- [ ] Compound Return

## 4.2 Risk

- [ ] Volatility
- [ ] Variance
- [ ] Maximum Drawdown
- [ ] VaR
- [ ] Expected Shortfall

## 4.3 Risk-adjusted Performance

- [ ] Sharpe Ratio
- [ ] Sortino Ratio
- [ ] Calmar Ratio

## 4.4 Benchmark

- [ ] Benchmark
- [ ] SPY
- [ ] Excess Return
- [ ] Alpha
- [ ] Beta
- [ ] Tracking Error

### 阶段产出

建立第一个 Strategy Report：

```text
Return
CAGR
Volatility
Sharpe
Maximum Drawdown
Alpha
Beta
vs SPY
```

### 这个阶段真的有用吗？

**极其有用，属于量化投资必修。**

因为：

> "年化 30%"本身没有意义。

必须同时知道它承担了什么风险，以及有没有只是承担了更多市场风险。

---
# Stage 5：Quant Signals / Technical Signals

## 目的

把"我觉得市场会涨"变成：

> **可以写成程序、可以验证的规则。**

## 阶段目标

能够把一个交易想法写成明确的：

```text
Input
→ Signal
→ Position
→ Return
```

## 5.1 Trend

- [ ] SMA
- [ ] EMA
- [ ] MA20
- [ ] MA50
- [ ] MA200
- [ ] Moving Average Crossover

## 5.2 Momentum

- [ ] Price Momentum
- [ ] 12-1 Momentum
- [ ] Relative Strength
- [ ] Momentum Ranking

## 5.3 Mean Reversion

- [ ] Reversal
- [ ] Mean Reversion
- [ ] Z-score
- [ ] Bollinger Bands

## 5.4 Oscillators

- [ ] RSI
- [ ] MACD

## 5.5 Volatility

- [ ] Historical Volatility
- [ ] ATR
- [ ] Low Volatility Signal

### 阶段产出

完成第一个自己的策略：

```text
例如：

MA20 > MA50
    ↓
Long

MA20 < MA50
    ↓
Cash
```

并能进行历史回测。

### 这个阶段真的有用吗？

**有用，但要正确理解。**

这些指标本身不是"赚钱公式"。

真正有价值的是学习：

> 如何把市场现象转换成可测试的假设。

不要把 RSI / MACD 当成圣杯。

---
# Stage 6：Factor Investing

## 目的

从"研究一只股票"升级到：

> **在一个股票池中系统寻找具有某种特征的股票。**

这是理解 `quant.ai` 的关键阶段。

## 阶段目标

能够：

```text
股票池
→ 计算因子
→ 排名
→ 选股
→ 构建组合
→ 回测
```

## 6.1 Factor 基础

- [ ] Factor
- [ ] Factor Exposure
- [ ] Factor Return

## 6.2 Classic Factors

- [ ] Momentum
- [ ] Value
- [ ] Size
- [ ] Quality
- [ ] Low Volatility
- [ ] Profitability
- [ ] Growth
- [ ] Reversal

## 6.3 Cross-sectional Analysis

- [ ] Ranking
- [ ] Quantile
- [ ] Decile
- [ ] Long-only
- [ ] Long-short
- [ ] Equal Weight

## 6.4 Factor Combination

- [ ] Factor Weight
- [ ] Composite Score
- [ ] Signal Combination
- [ ] Factor Correlation

### 阶段产出

完成自己的第一个 Factor Strategy：

```text
股票池
→ Momentum Ranking
→ Top 10%
→ Equal Weight
→ 每月调仓
→ 回测
```

然后增加：

```text
Momentum
+
Quality
+
Low Volatility
```

### 这个阶段真的有用吗？

**非常有用。**

这是从"个人技术分析"进入系统化量化研究的重要一步。

你之前看到 `quant.ai` 中的：

> 12-1 Momentum、Trend、Reversal、Low Volatility、信号权重搜索

主要就属于这一层。

---
# Stage 7：Backtesting

## 目的

把策略放进历史市场，模拟：

> 如果过去按照这个规则交易，会发生什么？

同时理解为什么"回测赚钱"并不等于"未来赚钱"。

## 阶段目标

自己能够构建一个基础 Backtesting Engine。

## 7.1 基础回测

- [ ] Signal
- [ ] Position
- [ ] Entry
- [ ] Exit
- [ ] Holding Period
- [ ] Rebalancing

## 7.2 Portfolio Backtest

- [ ] Position Sizing
- [ ] Equal Weight
- [ ] Cash
- [ ] Portfolio Return
- [ ] Equity Curve

## 7.3 Realistic Backtest

- [ ] Commission
- [ ] Transaction Cost
- [ ] Slippage
- [ ] Market Impact
- [ ] Liquidity

## 7.4 Backtest Evaluation

- [ ] CAGR
- [ ] Sharpe
- [ ] Maximum Drawdown
- [ ] Win Rate
- [ ] Turnover
- [ ] Profit Factor

### 阶段产出

自己的：

```text
data.py
strategy.py
backtest.py
metrics.py
```

能够跑：

```text
Data
→ Signal
→ Position
→ Portfolio
→ Equity Curve
→ Metrics
```

### 这个阶段真的有用吗？

**极其有用，是核心技能。**

这是把"理论策略"变成"可验证系统"的关键。

---
# Stage 8：防止回测欺骗 / Robust Research

## 目的

这是整个路线中最重要的阶段之一。

防止自己因为：

> 数据错误、未来数据、幸存者偏差、过拟合

而误以为找到了赚钱策略。

## 阶段目标

看到一个漂亮回测结果，你第一反应不是：

> "发财了。"

而是：

> "这个结果可信吗？"

## 8.1 Bias

- [ ] Look-ahead Bias
- [ ] Survivorship Bias
- [ ] Selection Bias
- [ ] Data Snooping

## 8.2 Overfitting

- [ ] Overfitting
- [ ] Underfitting
- [ ] Parameter Optimization
- [ ] Degrees of Freedom

## 8.3 Validation

- [ ] In-sample
- [ ] Out-of-sample
- [ ] Train / Test
- [ ] Walk-forward
- [ ] Rolling Window
- [ ] Cross-validation（了解适用场景，不机械套用）

## 8.4 Robustness

- [ ] Parameter Stability
- [ ] Regime Stability
- [ ] Sensitivity Analysis
- [ ] Stress Testing

### 阶段产出

拿一个历史上非常漂亮的策略：

```text
年化 50%
```

尝试证明：

> 它为什么可能不是真的。

然后修改研究流程，得到更可信的结果。

### 这个阶段真的有用吗？

**极其有用。**

这是"写回测代码"和"做严肃量化研究"的分水岭。

---
# Stage 9：Portfolio / Risk / Real Trading

## 目的

从：

> "一个策略能不能赚钱？"

进入：

> **"我应该拿多少钱做、怎么分配、如何活下来？"**

## 阶段目标

建立从研究到真实资金的完整流程：

```text
Research
→ Backtest
→ Out-of-sample
→ Paper Trading
→ Small Capital
→ Live
→ Journal
→ Review
```

## 9.1 Portfolio

- [ ] Diversification
- [ ] Correlation
- [ ] Covariance Matrix
- [ ] Position Sizing
- [ ] Concentration
- [ ] Exposure

## 9.2 Portfolio Optimization

- [ ] Mean-Variance
- [ ] Efficient Frontier
- [ ] Risk Parity
- [ ] Volatility Targeting

## 9.3 Risk Management

- [ ] Maximum Position
- [ ] Portfolio Exposure
- [ ] Drawdown Control
- [ ] Risk Budget
- [ ] Exit Rules
- [ ] Cash Management

## 9.4 Trading Infrastructure

- [ ] Broker API
- [ ] Order Management
- [ ] Execution
- [ ] Position Reconciliation
- [ ] Trading Logs
- [ ] Monitoring
- [ ] Alerts

### 阶段产出

建立自己的：

```text
Portfolio
+
Risk Engine
+
Trading Journal
+
Live Monitoring
```

并用**极小的、亏损后不影响生活的资金**进行真实验证。

### 这个阶段真的有用吗？

**对"靠投资养活自己"的目标非常有用。**

但必须强调：

> 投资能力 ≠ 保证稳定收入。

尤其在本金很小的阶段，靠投资收益直接养活自己通常不现实。

因此你的职业路线应该同时积累：

```text
投资能力
+
软件 / AI / Quant 工程能力
```

前者让你管理资本，后者让你在没有大量本金时也能创造现金流。

---
# Stage 10：AI Quant Engineering

## 目的

把前面学到的量化研究流程变成：

> **AI 可以协助执行、研究、解释、监控的系统。**

不是让 AI 直接"预测股票"。

## 阶段目标

最终能够对 AI 说：

> "研究美股中 Momentum + Quality + Low Volatility
> 的组合，并进行严格的样本外验证。"

AI 可以自动：

```text
理解任务
→ 制定研究计划
→ 调用数据
→ 计算因子
→ 生成策略
→ 调用回测引擎
→ 运行验证
→ 分析结果
→ 生成研究报告
```

但核心计算仍由确定性程序负责。

## 10.1 LLM 基础

- [ ] LLM
- [ ] Prompt
- [ ] Structured Output
- [ ] Function Calling
- [ ] Tool Use
- [ ] Context
- [ ] RAG

## 10.2 Agent

- [ ] Agent
- [ ] Tool Calling
- [ ] MCP
- [ ] Workflow
- [ ] Memory
- [ ] Evaluation
- [ ] Guardrails

## 10.3 AI Research

- [ ] 财报阅读
- [ ] 新闻分析
- [ ] 公司研究
- [ ] 投资假设生成
- [ ] 策略代码生成
- [ ] 回测解释
- [ ] 异常检测
- [ ] Research Report

## 10.4 Deterministic Quant Engine

AI 不应该直接决定：

- [ ] 原始数据计算
- [ ] 收益率计算
- [ ] 风险计算
- [ ] 回测结果
- [ ] 订单执行
- [ ] 风控

这些应该由确定性的程序完成。

### 阶段产出

自己的：

```text
AI Quant Research Assistant
```

例如：

```text
User
 ↓
AI Agent
 ↓
Research Planner
 ↓
Data Tools
 ↓
Quant Engine
 ↓
Backtest
 ↓
Validation
 ↓
Risk Engine
 ↓
AI Research Report
```

### 这个阶段真的有用吗？

**非常有用，而且与你的个人目标高度匹配。**

你的竞争力不应该是：

> "我让 AI 告诉我买什么。"

而应该是：

> **"我能构建一个可靠的研究系统，让 AI
> 帮我更快地提出、实现、验证和复盘投资假设。"**

---
# Stage 11：职业化与长期能力

> 这一阶段不是为了马上学，而是为了让"会量化"最终变成职业能力。

## 目的

让你的能力可以被别人验证、使用、购买或雇佣。

## 11.1 Quant / AI 工程能力

- [ ] Clean Architecture
- [ ] Testing
- [ ] Logging
- [ ] Monitoring
- [ ] Configuration Management
- [ ] Data Versioning
- [ ] Experiment Tracking
- [ ] Reproducibility
- [ ] Docker
- [ ] CI/CD
- [ ] Cloud Basics

## 11.2 Quant Research Workflow

- [ ] Research Notebook
- [ ] Experiment Log
- [ ] Hypothesis Registry
- [ ] Backtest Registry
- [ ] Model / Strategy Versioning
- [ ] Data Provenance
- [ ] Reproducible Research

## 11.3 Portfolio / Career

- [ ] GitHub Quant Portfolio
- [ ] 公开研究报告
- [ ] 可复现 Backtest
- [ ] AI Quant Demo
- [ ] Technical Writing
- [ ] Quant / Data / AI 项目经历

### 阶段产出

至少拥有：

```text
GitHub
├── Quant Research
├── Backtesting Engine
├── Factor Research
├── Portfolio / Risk
└── AI Quant Agent
```

这时候你就不只是：

> "学过量化。"

而是：

> **有一套可以展示、验证、继续迭代的真实作品。**

---
# ⭐ 哪些阶段最重要？

如果你的时间和精力有限，优先级不是平均分配。

## S 级：必须掌握

```text
Python / Pandas
金融数据
Return / Risk
Statistics
Factor
Backtesting
Bias / Overfitting
Portfolio / Risk
```

## A 级：强烈建议掌握

```text
基本面
Regression
Time Series
Optimization
Trading Infrastructure
AI Agent
MCP
```

## B 级：后期深入

```text
Stochastic Calculus
Derivatives Pricing
Monte Carlo
复杂数学金融模型
高频交易
Market Microstructure 深度研究
```

**不要因为看到 Quant 就立刻去学随机微积分。**

如果你的目标是：

> **自己投资 + AI 辅助量化 + 最终形成职业能力**

前面的 S 级内容带来的实际价值远高于一开始钻进高级数学。

---
# 📌 与 `quant.ai` 的对应关系

你现在研究的项目可以作为整条路线的"实战地图"。

  `quant.ai` 中的东西   对应学习阶段
  --------------------- --------------
  AAPL 分析             Stage 0--2
  RSI                   Stage 5
  Volatility            Stage 4--5
  MA20 / MA50           Stage 5
  12-1 Momentum         Stage 6
  Reversal              Stage 5--6
  Low Volatility        Stage 5--6
  Factor Ranking        Stage 6
  Signal Weight         Stage 6
  Backtest              Stage 7
  Walk-forward          Stage 8
  SPY Benchmark         Stage 4
  Alpha / Beta          Stage 4
  Portfolio             Stage 9
  AI Research           Stage 10

所以我们不是"学完以后再看 `quant.ai`"。

而是：

> **边学边拆 `quant.ai`，把它当作第一份真实量化工程案例。**

---
# 📍 当前进度

截至目前：

## Stage 0

- [ ] DataFrame
- [ ] Column
- [ ] Series 基本接触
- [ ] Index 基本接触
- [ ] MultiIndex
- [ ] `droplevel()`

## Stage 1

- [ ] Open
- [ ] High
- [ ] Low
- [ ] Close
- [ ] Volume
- [ ] Raw Close
- [ ] Adjusted Close
- [ ] Corporate Actions


```

---
# 🧭 我们以后每节课固定使用这个格式

```text
当前位置：
Stage X → Node X.X

本节点目的：
为什么学它？

本节点知识树：
□ 概念 A
□ 概念 B
□ 概念 C

今天：
只学习最多 3 个概念

实践：
写代码 / 看真实数据

验证：
你自己解释结果

完成：
□ A
□ B
□ C

下一步：
明确告诉你下一节点
```

这样你始终知道：

**我在哪里 → 为什么学 → 学什么 → 学完有什么用 → 下一步去哪。**

---
# 最终验收标准

不是"把所有框打勾"。

而是最终你能够独立完成：

```text
① 找到投资问题
        ↓
② 提出可验证假设
        ↓
③ 获取正确数据
        ↓
④ 清洗数据
        ↓
⑤ 构造因子 / 信号
        ↓
⑥ 构建策略
        ↓
⑦ 回测
        ↓
⑧ 检查 Bias
        ↓
⑨ Walk-forward / Out-of-sample
        ↓
⑩ 风险与组合
        ↓
⑪ Paper Trading
        ↓
⑫ 小资金实盘
        ↓
⑬ 记录与复盘
        ↓
⑭ AI 自动化研究流程
```

**这才是我们的毕业标准。**

而不是"学会 100 个金融术语"。

---
## 当前任务

路线图已经确定。

**不要往后跳。**