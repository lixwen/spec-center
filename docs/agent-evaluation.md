# Agent 评估系统

## 为什么需要评估

RAG Agent 的输出具有高度不确定性——同一个问题在不同上下文下可能产生截然不同的回答。传统的单元测试无法覆盖这种非确定性行为，我们需要一套专门的评估体系来回答：

- **Agent 选择了正确的工具吗？** 当用户问"某个 Spec 的内容是什么"，Agent 是否调用了 `get_spec_content` 而不是无关工具？
- **决策路径高效吗？** Agent 是否在 3 轮内完成任务，还是陷入了工具调用循环？
- **成本合理吗？** 一次对话消耗了多少 token，是否超出了预算？
- **回答包含关键信息吗？** 用户问了认证机制，回答中是否提到了 JWT、session 等核心概念？
- **回答质量如何？** 从 LLM 的视角看，回答是否准确、完整、有条理？

Spec Center 的 Agent 评估系统基于吴恩达 Evaluation-Driven Development 方法论，将这些关切量化为可自动运行、可持续追踪的指标。

### 评估驱动开发

评估不仅是上线前的门禁，更是开发过程中的反馈信号。推荐的工作流：

1. **写评估数据集** → 根据业务场景编写 `input` + `expected`
2. **运行评估** → 得到通过率和各维度分数
3. **改进 Agent** → 优化 prompt、工具定义、RAG 检索
4. **再次评估** → 验证改进效果，防止回退
5. **CI 守护** → 将评估集成到 CI pipeline，阻止质量下降的代码合入

## 系统概览

### 架构

> **评估数据集** → **评估运行器** → **评估器打分** → **结果持久化** → **双入口查看**

**1. 数据集来源**

| 来源 | 存储 | 加载方式 |
|------|------|----------|
| Web 模式 | MongoDB `eval_datasets` | 从数据库读取 |
| CLI 模式 | `datasets/*.json` 文件 | 从文件系统读取 |

**2. 评估运行器**

运行器根据选择的评估模式获取 Agent 输出：

- **Trace 回放** — 从 MongoDB 读取已有 trace
- **实时 Agent** — 调用 `queryRagStream` 获取实时回答
- **无 Agent 输出** — 跳过，仅运行 code-based 评估器

**3. 评估器**

| 类型 | 评估器 | 特点 |
|------|--------|------|
| Code-based | `tool-selection`、`trajectory-efficiency`、`cost-threshold`、`keyword-coverage` | 确定性规则，毫秒级，零成本 |
| LLM-as-a-Judge | `llm-judge` | 独立 LLM 调用，多维度打分 |

**4. 结果持久化（MongoDB）**

| Collection | 内容 |
|------------|------|
| `eval_runs` | 运行记录与汇总统计 |
| `eval_results` | 逐样本、逐评估器的详细结果 |
| `eval_configs` | 评估器配置与参数 |

**5. 双入口**

| 入口 | 路径 |
|------|------|
| CLI | `npm run eval` |
| Web | `/admin/ai-traces` → Agent 评估 Tab |

### 核心概念

| 概念 | 说明 |
|------|------|
| **评估数据集 (Dataset)** | 一组评估样本，按业务场景分类（如 spec-query、change-query）。每个样本包含 `input`（用户输入）和 `expected`（期望指标） |
| **评估器 (Evaluator)** | 对 Agent 输出的某个维度打分的函数。分为 code-based（确定性规则）和 LLM judge（LLM 评判） |
| **评估运行 (Eval Run)** | 一次完整的评估执行。加载数据集 → 获取 Agent 输出 → 各评估器打分 → 汇总报告 |
| **通过阈值 (Pass Threshold)** | 当评估器分数 ≥ 该阈值时判定为 pass。默认 0.7，可在 Web Config 中调整 |
| **评估模式 (Eval Mode)** | 获取 Agent 输出的三种方式：回放已有 Trace、实时调用 Agent、无 Agent 输出（仅代码评估器） |

## 评估器详解

### Code-based 评估器

Code-based 评估器使用确定性规则打分，速度快（毫秒级）、零成本、结果可复现。

#### tool-selection（工具选择准确性）

检查 Agent 是否调用了数据集中期望的工具。

- **数据来源**：`ai_spans` 中 `type="tool"` 的 span → 提取实际使用的工具名列表
- **评分**：`匹配工具数 / 期望工具总数`
- **何时有用**：验证 Agent 是否理解用户意图并选择了正确的工具链
- **样本配置**：`expected.tools_used: ["get_spec_content", "search_knowledge"]`

#### trajectory-efficiency（决策路径效率）

评估 Agent 完成任务的轮次是否合理，并检测工具调用循环。

- **数据来源**：`trace.agentRounds`（实际轮次）vs `expected.max_rounds`（预期上限）
- **评分**：轮次在预期内为 1.0，超出时按比例递减
- **循环检测**：连续两次使用相同工具和相同参数时标记为循环
- **可调参数**：`roundMultiplier`（轮次宽容系数，默认 1.0）

#### cost-threshold（成本合理性）

检查单次交互的 token 消耗和估算成本是否在阈值内。

- **数据来源**：`trace.estimatedCostUsd`、`trace.totalPromptTokens + totalCompletionTokens`
- **评分**：两项都在阈值内 = 1.0，一项超出 = 0.5，都超出 = 0.0
- **可调参数**：`maxCostUsd`（默认 0.10 美元）、`maxTokens`（默认 50000）

#### keyword-coverage（关键信息覆盖）

检查回答中是否包含期望的关键信息，以及不应出现的内容。

- **正面检查**：`expected.keywords` 中每个关键词是否出现在回答中（默认大小写不敏感）
- **负面检查**：`expected.should_not_contain` 中任一命中则直接 score=0, label=fail
- **评分**：`匹配关键词数 / 期望关键词总数`
- **可调参数**：`caseSensitive`（是否区分大小写，默认 false）

### LLM-as-a-Judge 评估器

#### llm-judge（LLM 评判）

使用独立的 LLM 调用对回答质量进行多维度打分。

- **工作原理**：将 `example.input`（任务）和 `agentOutput`（Agent 回答）发送给评判模型，要求返回 JSON 格式的维度分数（每个维度 0~1），取平均值作为最终得分
- **模型选择**：通过 `EVAL_JUDGE_MODEL` 环境变量指定，默认使用 Agent 同模型
- **temperature**：固定为 0（最大化评判一致性）
- **耗时**：每个样本 10~60 秒（取决于模型和回答长度）
- **降级处理**：LLM 返回无效 JSON 时 score=0, label=fail

## 评估数据集

### 数据集格式

每个评估样本（`EvalExample`）的结构：

```json
{
  "id": "spec-q-001",
  "category": "spec-query",
  "input": "请帮我查看 user-auth 的 spec 内容",
  "context": {
    "projectIds": ["proj_alpha"]
  },
  "expected": {
    "tools_used": ["get_spec_content"],
    "keywords": ["user-auth", "认证", "授权"],
    "max_rounds": 5,
    "should_not_contain": ["抱歉，我无法"],
    "reference_answer": "（可选）参考答案用于 LLM judge 对比"
  }
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识符 |
| `category` | 是 | 场景分类（如 `spec-query`、`change-query`） |
| `input` | 是 | 模拟用户输入的文本 |
| `context.projectIds` | 否 | Agent 可访问的项目 ID（不填则使用默认项目） |
| `expected.tools_used` | 否 | 期望 Agent 调用的工具列表 |
| `expected.keywords` | 否 | 回答中应包含的关键词/短语 |
| `expected.max_rounds` | 否 | 最大合理 Agent 轮次 |
| `expected.should_not_contain` | 否 | 回答中不应出现的内容 |
| `expected.reference_answer` | 否 | 参考答案（LLM judge 用于对比） |

### 内置数据集

| 数据集 | 场景 | 样本数 | 考察重点 |
|--------|------|--------|----------|
| `spec-query` | Spec 内容查询 | 4 | 工具选择、关键信息 |
| `change-query` | Change 查询与分析 | 3 | 多工具编排、分析质量 |
| `review-analysis` | Review 多工具编排 | 3 | 工具链效率、分析深度 |
| `knowledge-search` | 知识库搜索 | 3 | 检索质量、回答相关性 |
| `boundary` | 边界与错误处理 | 3 | 异常处理、拒绝回答能力 |

### 编写好的评估样本

好的评估样本应该：

- **具体**：`input` 模拟真实用户会问的问题，而非抽象的测试语句
- **可验证**：`expected` 中的指标应该是可客观判定的，避免主观描述
- **有区分度**：样本应覆盖正常路径、边界情况和错误场景
- **独立**：每个样本不依赖其他样本的执行结果

## 三种评估模式

评估运行需要获取 Agent 的输出（包括回答文本和 trace 数据），系统支持三种模式：

### Trace 回放模式

使用已有的 Agent 对话 trace 来评估。适用于对生产中发现的问题进行回溯分析。

- **数据来源**：从 MongoDB 读取 `ai_traces`、`ai_spans` 和 `agentTasks.full_answer`
- **同一 trace 应用于所有样本**：回放模式下，选中的 trace 会被所有样本共用
- **速度**：快（仅读数据库 + 运行评估器）
- **适用场景**：生产问题回溯、对比同一对话在不同评估标准下的表现

### 实时 Agent 模式

为每个数据集样本实时调用 Agent API（`queryRagStream`），获取全新的回答。

- **数据来源**：每个样本独立调用 Agent，产生独立的 trace
- **速度**：慢（每个样本需要完整的 RAG + Agent 流程，含 LLM judge 时更慢）
- **适用场景**：Agent 改进后的全量回归测试、新数据集的首次评估

### 无 Agent 输出模式

不获取 Agent 输出，仅运行 code-based 评估器。因为没有 `agentOutput`，keyword-coverage 和 llm-judge 会直接返回低分。

- **速度**：最快（毫秒级）
- **适用场景**：验证评估配置和数据集格式是否正确

## 使用方式

### Web 端（推荐）

Web 端是评估系统的主要入口，无需终端和代码库访问权限。

#### 运行评估

1. 访问 `/admin/ai-traces`，切换到"评估"Tab
2. 点击右上角"运行评估"按钮
3. 选择评估模式（回放 Trace / 实时 Agent / 无 Agent 输出）
4. 如果选择 Trace 回放：搜索并选中一个 trace
5. 选择数据集分类（全部或指定分类）
6. 可选勾选"仅代码评估"跳过 LLM judge
7. 确认运行

运行过程中会显示实时进度（已完成样本数 / 总数），完成后自动刷新 Dashboard。

#### 管理数据集

切换到"数据集"Tab，可以：

- 创建、编辑、删除数据集
- 编辑样本的 JSON 内容
- 从 JSON 文件导入 / 导出数据集

#### 配置评估器

切换到"配置"Tab，可以：

- 查看所有可用评估器及其类型
- 启用/禁用单个评估器
- 调整参数（如 cost-threshold 的 `maxCostUsd`、trajectory-efficiency 的 `roundMultiplier`）
- 设置全局通过阈值（Pass Threshold，默认 0.7）

### CLI

CLI 适用于本地开发和 CI/CD 场景，从文件系统加载数据集。

#### 基本命令

```bash
npm run eval [options]
```

#### 参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--category <name>` | 只运行指定分类 | `--category spec-query` |
| `--trace <traceId>` | 对已有 trace 运行评估 | `--trace trace_abc123` |
| `--evaluator <name>` | 只运行指定评估器 | `--evaluator tool-selection` |
| `--code-only` | 跳过 LLM judge（快速模式） | `--code-only` |

#### 使用示例

```bash
# 快速模式：只跑 spec-query 分类的 code-based 评估器
npm run eval -- --category spec-query --code-only

# 对生产中的某个 trace 运行全部评估
npm run eval -- --trace trace_682ab3f1

# 只看工具选择准确性
npm run eval -- --evaluator tool-selection
```

#### 输出示例

运行完成后会输出结构化报告：

**运行信息**

| 字段 | 值 |
|------|------|
| Run ID | `evalrun_a1b2c3` |
| Run at | `2026-05-06T08:00:00.000Z` |
| Dataset hash | `3f8a2b1e4c5d6f70` |
| Model | `xiaomi/mimo-v2.5-pro` |

**汇总**

| 指标 | 值 |
|------|------|
| Total examples | 17 |
| Pass rate | 82.4% |
| Avg score | 0.891 |

**按分类**

| category | count | pass% | avgScore |
|----------|-------|-------|----------|
| boundary | 3 | 67% | 0.778 |
| change-query | 3 | 100% | 1.000 |
| knowledge-search | 3 | 67% | 0.833 |
| review-analysis | 3 | 100% | 0.944 |
| spec-query | 4 | 75% | 0.875 |

**按评估器**

| evaluator | avg score | pass% |
|-----------|-----------|-------|
| cost-threshold | 1.000 | 100% |
| keyword-coverage | 0.750 | 65% |
| tool-selection | 0.900 | 82% |
| trajectory-efficiency | 0.920 | 88% |

**失败样本**

| example id | evaluator | score | reason |
|------------|-----------|-------|--------|
| boundary-003 | keyword-coverage | 0 | `should_not_contain` match: "抱歉" |

### CI/CD 集成

在 CI pipeline 中添加评估守护：

```yaml
- name: Run Agent Evaluation
  run: npm run eval -- --code-only
  env:
    SC_MONGODB_URL: ${{ secrets.MONGODB_URL }}
    EVAL_PASS_THRESHOLD: "0.7"
```

`--code-only` 避免 CI 中产生 LLM 调用费用。通过率低于 `EVAL_PASS_THRESHOLD` 时进程返回非零退出码，阻断 pipeline。

## 通过率与标签判定

每个评估器返回一个 `score`（0~1），系统通过 `passThreshold` 将 score 转换为标签：

| score 范围 | 标签 | 含义 |
|------------|------|------|
| `score ≥ passThreshold` | `pass` | 通过 |
| `0 < score < passThreshold` | `partial` | 部分通过 |
| `score = 0` | `fail` | 失败 |

默认 `passThreshold = 0.7`，可在 Web 端的"配置"Tab 中调整。

**样本级通过率**：一个样本只有当**所有**评估器都判定为 `pass` 时，才算该样本通过。总体通过率 = 通过样本数 / 总样本数。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `EVAL_JUDGE_MODEL` | 与 Agent 同模型 | LLM judge 使用的模型 |
| `EVAL_MAX_COST_USD` | `0.10` | cost-threshold 的成本阈值（美元），可被 Web Config 覆盖 |
| `EVAL_MAX_TOKENS` | `50000` | cost-threshold 的 token 阈值，可被 Web Config 覆盖 |
| `EVAL_PASS_THRESHOLD` | `0.7` | CLI 模式下的通过率阈值（低于此值退出码非零） |

## 扩展评估器

实现 `Evaluator` 接口即可添加自定义评估器：

```typescript
import type { Evaluator } from "./evaluator";
import { labelFromScore } from "./evaluator";

export const myCustomEvaluator: Evaluator = {
  name: "my-custom",
  type: "code-based",
  defaultParams: { myThreshold: 0.8 },
  async evaluate(trace, spans, example, agentOutput, params) {
    const threshold = (params?.myThreshold as number) ?? 0.8;
    // 自定义评估逻辑
    const score = computeScore(trace, example);
    return {
      evaluator: "my-custom",
      score,
      label: labelFromScore(score, params),
      reason: score >= threshold ? "checks passed" : "below threshold"
    };
  }
};
```

注册步骤：
1. 在 `packages/core/src/eval/evaluators/` 下创建评估器文件
2. 在 `packages/core/src/eval/evaluators/index.ts` 的 `getAllCodeEvaluators()` 中注册
3. 重新部署后，Web 端的"配置"Tab 会自动显示新评估器

## 数据集文件存储位置

CLI 模式从文件系统加载数据集，文件存放在 `packages/core/src/eval/datasets/`：

| 文件 | 场景 |
|------|------|
| `spec-query.json` | Spec 内容查询 |
| `change-query.json` | Change 查询与分析 |
| `review-analysis.json` | Review 多工具编排 |
| `knowledge-search.json` | 知识库搜索 |
| `boundary.json` | 边界与错误处理 |

Web 模式从 MongoDB `eval_datasets` collection 加载。可通过"数据集"Tab 的导入功能将 JSON 文件导入 MongoDB。

## 常见问题

### 通过率为什么是 0%？

检查以下几点：
1. **是否有 Agent 输出？** 如果使用"无 Agent 输出"模式或未指定 trace，keyword-coverage 和 llm-judge 会因为输入为空而返回低分。改用"Trace 回放"或"实时 Agent"模式
2. **通过阈值设置是否合理？** 默认 0.7，llm-judge 的平均分通常在 0.5~0.9 之间。在"配置"Tab 中确认 Pass Threshold
3. **样本的 `expected` 设置是否过严？** 如果 `keywords` 列表过长或包含不太可能出现的精确词汇，keyword-coverage 分数会偏低

### LLM judge 瞬间完成是怎么回事？

如果 llm-judge 在 0~1 毫秒内完成，并且 reason 是 "no agent output to judge"，说明 Agent 输出为空。检查评估模式是否正确——需要使用"Trace 回放"或"实时 Agent"模式才能获取真实的 Agent 输出。

### 如何对生产问题做回溯评估？

1. 在 Web 端"AI Traces"Tab 中找到有问题的对话 trace
2. 记下 `traceId`
3. 使用 CLI：`npm run eval -- --trace <traceId>`
4. 或在 Web 端：运行评估 → 选择"回放 Trace"→ 搜索并选中该 trace → 确认运行
5. 查看报告定位问题维度（工具选择错误？轮次过多？关键信息缺失？LLM 评分低？）
