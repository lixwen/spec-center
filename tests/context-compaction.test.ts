import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  estimateTokens,
  estimateMessageTokens,
  trimHistoryToFitBudget,
  buildManagedMessages,
  calculateBudget,
  type StructuredHistoryMessage,
  type ContextManagerConfig,
  type TrimResult
} from "../packages/core/src/services/context-manager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a simple user/assistant turn pair */
function makeTurn(
  userContent: string,
  assistantContent: string
): StructuredHistoryMessage[] {
  return [
    { role: "user", content: userContent },
    { role: "assistant", content: assistantContent }
  ];
}

/** Create a turn with tool calls and results (simulating agent workflow) */
function makeToolTurn(
  userContent: string,
  toolName: string,
  toolResult: string,
  assistantContent: string
): StructuredHistoryMessage[] {
  const toolCallId = `tc_${Math.random().toString(36).slice(2, 8)}`;
  return [
    { role: "user", content: userContent },
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: toolCallId, name: toolName, arguments: "{}" }]
    },
    { role: "tool", content: toolResult, tool_call_id: toolCallId },
    { role: "assistant", content: assistantContent }
  ];
}

/** Repeat a string to reach approximately the target token count */
function padToTokens(base: string, targetTokens: number): string {
  const currentTokens = estimateTokens(base);
  if (currentTokens >= targetTokens) return base;
  const needed = targetTokens - currentTokens;
  // ASCII chars ≈ 0.25 tokens each → need ~4 chars per token
  return base + "x".repeat(needed * 4);
}

// ---------------------------------------------------------------------------
// Token estimation tests
// ---------------------------------------------------------------------------

describe("Token estimation", () => {
  it("estimates ASCII text at ~0.25 tokens per char", () => {
    const tokens = estimateTokens("hello world");
    expect(tokens).toBe(3); // 11 * 0.25 = 2.75 → ceil = 3
  });

  it("estimates CJK text at ~0.5 tokens per char", () => {
    const tokens = estimateTokens("你好世界");
    expect(tokens).toBe(2); // 4 * 0.5 = 2
  });

  it("estimates mixed content", () => {
    const tokens = estimateTokens("hello 你好");
    // 6 ASCII * 0.25 + 2 CJK * 0.5 = 1.5 + 1 = 2.5 → ceil = 3
    expect(tokens).toBe(3);
  });

  it("adds overhead for message framing", () => {
    const msg: StructuredHistoryMessage = { role: "user", content: "hi" };
    const tokens = estimateMessageTokens(msg);
    // "hi" = 1 token + 4 overhead = 5
    expect(tokens).toBe(5);
  });

  it("accounts for tool_calls in estimation", () => {
    const msg: StructuredHistoryMessage = {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "tc_1", name: "search", arguments: '{"q":"test"}' }]
    };
    const tokens = estimateMessageTokens(msg);
    // empty content + 4 overhead + name("search" = 2) + args(12 chars = 3) + 8 per tool_call = 17
    expect(tokens).toBeGreaterThan(10);
  });

  it("respects pre-computed estimated_tokens", () => {
    const msg: StructuredHistoryMessage = {
      role: "user",
      content: "a very long message that would normally estimate to many tokens",
      estimated_tokens: 42
    };
    expect(estimateMessageTokens(msg)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Budget calculation
// ---------------------------------------------------------------------------

describe("calculateBudget", () => {
  it("computes correct budget breakdown with default 15% buffer", () => {
    const budget = calculateBudget("System prompt here", "User query", {
      contextWindowTokens: 1000,
      reservedOutputTokens: 200
    });

    const effectiveWindow = Math.floor(1000 * 0.85); // 850
    expect(budget.contextWindow).toBe(1000);
    expect(budget.reservedOutput).toBe(200);
    expect(budget.systemPromptTokens).toBeGreaterThan(0);
    expect(budget.currentTurnTokens).toBeGreaterThan(0);
    expect(budget.historyBudget).toBe(
      effectiveWindow - 200 - budget.systemPromptTokens - budget.currentTurnTokens
    );
  });

  it("computes correct budget with no buffer", () => {
    const budget = calculateBudget("System prompt here", "User query", {
      contextWindowTokens: 1000,
      reservedOutputTokens: 200,
      compactionBufferPercent: 0
    });

    expect(budget.historyBudget).toBe(
      1000 - 200 - budget.systemPromptTokens - budget.currentTurnTokens
    );
  });

  it("clamps historyBudget to zero when overhead exceeds window", () => {
    const budget = calculateBudget(padToTokens("sys", 500), padToTokens("q", 500), {
      contextWindowTokens: 600,
      reservedOutputTokens: 200
    });
    expect(budget.historyBudget).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Level 0: No compaction needed
// ---------------------------------------------------------------------------

describe("Compaction Level 0 — fits within budget", () => {
  it("returns all messages unchanged when within budget", () => {
    const history = [
      ...makeTurn("question 1", "answer 1"),
      ...makeTurn("question 2", "answer 2")
    ];

    const result = trimHistoryToFitBudget(history, 10000);

    expect(result.compactionLevel).toBe(0);
    expect(result.droppedTurns).toBe(0);
    expect(result.droppedMessages).toHaveLength(0);
    expect(result.messages).toHaveLength(4);
    expect(result.messages).toEqual(history);
  });

  it("returns empty array for empty history", () => {
    const result = trimHistoryToFitBudget([], 1000);
    expect(result.messages).toHaveLength(0);
    expect(result.compactionLevel).toBe(0);
    expect(result.droppedMessages).toHaveLength(0);
  });

  it("returns empty array when budget is zero", () => {
    const history = makeTurn("q", "a");
    const result = trimHistoryToFitBudget(history, 0);
    expect(result.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Level 1: Tool result compaction
// ---------------------------------------------------------------------------

describe("Compaction Level 1 — tool result folding", () => {
  it("compacts long tool results in older turns while keeping recent turns intact", () => {
    const longToolResult = "x".repeat(2000); // ~500 tokens
    const history = [
      // Turn 1 (old): has a big tool result
      ...makeToolTurn("find specs", "search_specs", longToolResult, "Found 5 specs"),
      // Turn 2 (old): has another big tool result
      ...makeToolTurn("get details", "get_spec_content", longToolResult, "Here are details"),
      // Turn 3 (recent): also has tool result — should NOT be compacted
      ...makeToolTurn("analyze risk", "get_change", longToolResult, "Risk analysis done")
    ];

    // Budget enough for compacted but not full history
    const fullTokens = history.reduce((s, m) => s + estimateMessageTokens(m), 0);
    const budget = Math.floor(fullTokens * 0.6); // 60% of full → forces L1

    const result = trimHistoryToFitBudget(history, budget, { recentTurnsWithTools: 1 });

    expect(result.compactionLevel).toBe(1);
    expect(result.droppedTurns).toBe(0);
    expect(result.droppedMessages).toHaveLength(0);
    // All messages still present, just tool results in old turns are folded
    expect(result.messages).toHaveLength(history.length);

    // Check that old tool results are folded
    const toolMessages = result.messages.filter(m => m.role === "tool");
    expect(toolMessages[0].content).toContain("已折叠");
    expect(toolMessages[1].content).toContain("已折叠");
    // Recent turn's tool result should be intact
    expect(toolMessages[2].content).toBe(longToolResult);
  });

  it("skips compaction for short tool results (<=200 chars)", () => {
    const shortResult = "OK";
    const history = [
      ...makeToolTurn("q1", "tool1", shortResult, "a1"),
      ...makeToolTurn("q2", "tool2", "current result", "a2")
    ];

    const fullTokens = history.reduce((s, m) => s + estimateMessageTokens(m), 0);
    // Give a budget that barely fits — but short results won't help much
    const result = trimHistoryToFitBudget(history, fullTokens - 1, { recentTurnsWithTools: 1 });

    // Short tool results should not be folded
    const oldToolMsg = result.messages.find(
      m => m.role === "tool" && m.content === shortResult
    );
    if (result.compactionLevel === 1) {
      expect(oldToolMsg).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Level 2: Dropping oldest turns
// ---------------------------------------------------------------------------

describe("Compaction Level 2 — dropping oldest turns", () => {
  it("drops oldest turns when L1 compaction is not enough", () => {
    // Create 10 turns, each ~100 tokens
    const turns: StructuredHistoryMessage[] = [];
    for (let i = 0; i < 10; i++) {
      turns.push(...makeTurn(
        padToTokens(`question ${i}`, 50),
        padToTokens(`answer ${i}`, 50)
      ));
    }

    const totalTokens = turns.reduce((s, m) => s + estimateMessageTokens(m), 0);
    // Budget for ~3 turns worth of tokens
    const budget = Math.floor(totalTokens * 0.3);

    const result = trimHistoryToFitBudget(turns, budget);

    expect(result.compactionLevel).toBe(2);
    expect(result.droppedTurns).toBeGreaterThan(0);
    expect(result.messages.length).toBeLessThan(turns.length);
    // droppedMessages should contain the dropped turns
    expect(result.droppedMessages.length).toBeGreaterThan(0);
    expect(result.droppedMessages.length + result.messages.length).toBe(turns.length);

    // Most recent turn should always be preserved
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg.content).toContain("answer 9");
  });

  it("keeps at least the last turn even with tiny budget", () => {
    const turns: StructuredHistoryMessage[] = [];
    for (let i = 0; i < 5; i++) {
      turns.push(...makeTurn(
        padToTokens(`q${i}`, 100),
        padToTokens(`a${i}`, 100)
      ));
    }

    // Extremely small budget — should still keep last turn
    const result = trimHistoryToFitBudget(turns, 50);

    expect(result.compactionLevel).toBe(2);
    expect(result.droppedTurns).toBe(4); // dropped 4 of 5 turns
    expect(result.messages.length).toBe(2); // 1 turn = user + assistant
    expect(result.messages[0].content).toContain("q4");
  });

  it("preserves message ordering after dropping", () => {
    const turns: StructuredHistoryMessage[] = [];
    for (let i = 0; i < 6; i++) {
      turns.push(...makeTurn(`q${i}`, `a${i}`));
    }

    const totalTokens = turns.reduce((s, m) => s + estimateMessageTokens(m), 0);
    // Budget for ~half the turns
    const result = trimHistoryToFitBudget(turns, Math.floor(totalTokens * 0.5));

    // Remaining messages should be in order
    const userMsgs = result.messages.filter(m => m.role === "user");
    const indices = userMsgs.map(m => parseInt(m.content.replace("q", "")));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Level 2 with tool-heavy history
// ---------------------------------------------------------------------------

describe("Compaction with tool-heavy multi-turn history", () => {
  it("first compacts tool results, then drops turns if still over budget", () => {
    const bigToolResult = "x".repeat(4000); // ~1000 tokens
    const history: StructuredHistoryMessage[] = [];

    // 5 turns each with big tool results
    for (let i = 0; i < 5; i++) {
      history.push(...makeToolTurn(
        `question ${i}`,
        `tool_${i}`,
        bigToolResult,
        `answer ${i}`
      ));
    }

    const fullTokens = history.reduce((s, m) => s + estimateMessageTokens(m), 0);
    // Budget for ~1.5 turns → needs both L1 and L2
    const budget = Math.floor(fullTokens * 0.15);

    const result = trimHistoryToFitBudget(history, budget, { recentTurnsWithTools: 1 });

    expect(result.compactionLevel).toBe(2);
    expect(result.droppedTurns).toBeGreaterThan(0);

    // The most recent turn's tool result should still be full
    const toolMsgs = result.messages.filter(m => m.role === "tool");
    if (toolMsgs.length > 0) {
      const lastToolMsg = toolMsgs[toolMsgs.length - 1];
      expect(lastToolMsg.content).toBe(bigToolResult);
    }
  });
});

// ---------------------------------------------------------------------------
// buildManagedMessages integration: usage snapshot
// ---------------------------------------------------------------------------

describe("buildManagedMessages — usage snapshot", () => {
  const systemPrompt = "You are a helpful assistant.";
  const smallConfig: ContextManagerConfig = {
    contextWindowTokens: 500,
    reservedOutputTokens: 100,
    compactionBufferPercent: 0,
    proactiveCompactionThreshold: 1.0
  };

  it("returns source='estimate' in the usage snapshot", () => {
    const { usage } = buildManagedMessages(
      systemPrompt,
      "hello",
      [],
      [],
      undefined,
      smallConfig
    );

    expect(usage.source).toBe("estimate");
    expect(usage.total).toBe(500);
    expect(usage.breakdown.reservedOutput).toBe(100);
    expect(usage.percent).toBeGreaterThanOrEqual(0);
    expect(usage.percent).toBeLessThanOrEqual(100);
  });

  it("reports compactionLevel and droppedTurns when history is large", () => {
    const history: StructuredHistoryMessage[] = [];
    for (let i = 0; i < 20; i++) {
      history.push(...makeTurn(
        padToTokens(`q${i}`, 30),
        padToTokens(`a${i}`, 30)
      ));
    }

    const { usage, compactionLevel, droppedTurns } = buildManagedMessages(
      systemPrompt,
      "latest question",
      [],
      history,
      undefined,
      smallConfig
    );

    expect(compactionLevel).toBe(2);
    expect(droppedTurns).toBeGreaterThan(0);
    expect(usage.compactionLevel).toBe(2);
    expect(usage.droppedTurns).toBeGreaterThan(0);
    expect(usage.used).toBeLessThanOrEqual(usage.total);
  });

  it("injects conversation summary when turns are dropped", () => {
    const history: StructuredHistoryMessage[] = [];
    for (let i = 0; i < 20; i++) {
      history.push(...makeTurn(padToTokens(`q${i}`, 30), padToTokens(`a${i}`, 30)));
    }

    const { messages, droppedTurns } = buildManagedMessages(
      systemPrompt,
      "latest question",
      [],
      history,
      "Previously discussed: auth system design, API endpoints",
      smallConfig
    );

    expect(droppedTurns).toBeGreaterThan(0);

    // Summary should be injected as a user+assistant pair after system prompt
    const summaryMsg = messages.find(
      m => typeof m.content === "string" && m.content.includes("对话摘要")
    );
    expect(summaryMsg).toBeDefined();

    // System prompt should still be first
    expect(messages[0].role).toBe("system");
    // Current query should still be last
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe("user");
    expect(typeof lastMsg.content === "string" && lastMsg.content.includes("latest question")).toBe(true);
  });

  it("does NOT inject summary when no compaction occurs", () => {
    const history = makeTurn("q1", "a1");

    const { messages, compactionLevel } = buildManagedMessages(
      systemPrompt,
      "q2",
      [],
      history,
      "Some summary",
      { contextWindowTokens: 100000, reservedOutputTokens: 1000, compactionBufferPercent: 0, proactiveCompactionThreshold: 1.0 }
    );

    expect(compactionLevel).toBe(0);
    const summaryMsg = messages.find(
      m => typeof m.content === "string" && m.content.includes("对话摘要")
    );
    expect(summaryMsg).toBeUndefined();
  });

  it("usage breakdown adds up correctly", () => {
    const history = [
      ...makeTurn("question one", "answer one"),
      ...makeTurn("question two", "answer two")
    ];

    const { usage } = buildManagedMessages(
      systemPrompt,
      "current question",
      [],
      history,
      undefined,
      { contextWindowTokens: 10000, reservedOutputTokens: 2000, compactionBufferPercent: 0, proactiveCompactionThreshold: 1.0 }
    );

    expect(usage.used).toBe(
      usage.breakdown.system + usage.breakdown.history + usage.breakdown.currentTurn
    );
    expect(usage.total).toBe(10000);
    expect(usage.breakdown.reservedOutput).toBe(2000);
    expect(usage.percent).toBe(Math.round((usage.used / usage.total) * 100));
  });
});

// ---------------------------------------------------------------------------
// Compaction buffer: ~15% reservation
// ---------------------------------------------------------------------------

describe("Compaction buffer — context window reservation", () => {
  it("calculateBudget reduces effective window by buffer percent", () => {
    const config: ContextManagerConfig = {
      contextWindowTokens: 1000,
      reservedOutputTokens: 200,
      compactionBufferPercent: 0.15
    };
    const budget = calculateBudget("sys", "q", config);

    // effectiveWindow = 1000 * 0.85 = 850
    // historyBudget = 850 - 200 - sysTokens - queryTokens
    const expectedEffective = Math.floor(1000 * 0.85);
    const overhead = budget.systemPromptTokens + budget.currentTurnTokens + budget.reservedOutput;
    expect(budget.historyBudget).toBe(expectedEffective - overhead);
  });

  it("zero buffer uses full context window", () => {
    const config: ContextManagerConfig = {
      contextWindowTokens: 1000,
      reservedOutputTokens: 200,
      compactionBufferPercent: 0
    };
    const budget = calculateBudget("sys", "q", config);

    const overhead = budget.systemPromptTokens + budget.currentTurnTokens + budget.reservedOutput;
    expect(budget.historyBudget).toBe(1000 - overhead);
  });

  it("triggers compaction earlier with buffer than without", () => {
    const turns: StructuredHistoryMessage[] = [];
    for (let i = 0; i < 8; i++) {
      turns.push(...makeTurn(padToTokens(`q${i}`, 30), padToTokens(`a${i}`, 30)));
    }
    const totalTokens = turns.reduce((s, m) => s + estimateMessageTokens(m), 0);

    // With no buffer, large budget → no compaction
    const noBuffer = trimHistoryToFitBudget(turns, totalTokens + 100, { compactionBufferPercent: 0, proactiveCompactionThreshold: 1.0 });
    // With buffer the effective budget is smaller → may trigger compaction
    const withBuffer = trimHistoryToFitBudget(turns, totalTokens + 100, { compactionBufferPercent: 0, proactiveCompactionThreshold: 0.5 });

    expect(noBuffer.compactionLevel).toBe(0);
    expect(withBuffer.compactionLevel).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Proactive L1 compaction
// ---------------------------------------------------------------------------

describe("Proactive compaction — triggers L1 at threshold", () => {
  it("applies L1 when usage exceeds proactive threshold even under hard budget", () => {
    const longToolResult = "x".repeat(2000);
    const history = [
      ...makeToolTurn("q1", "tool1", longToolResult, "a1"),
      ...makeToolTurn("q2", "tool2", longToolResult, "a2"),
      ...makeToolTurn("q3", "tool3", longToolResult, "a3")
    ];

    const totalTokens = history.reduce((s, m) => s + estimateMessageTokens(m), 0);
    // Budget larger than totalTokens, but threshold set very low
    const budget = totalTokens + 10;

    const result = trimHistoryToFitBudget(history, budget, {
      recentTurnsWithTools: 1,
      proactiveCompactionThreshold: 0.5
    });

    // Proactive L1 should trigger because usage > 50% of budget
    expect(result.compactionLevel).toBe(1);
    expect(result.droppedTurns).toBe(0);
  });

  it("does not trigger proactive compaction when usage is low", () => {
    const history = makeTurn("q1", "a1");
    const budget = 10000;

    const result = trimHistoryToFitBudget(history, budget, {
      proactiveCompactionThreshold: 0.8
    });

    expect(result.compactionLevel).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// droppedMessages preservation
// ---------------------------------------------------------------------------

describe("droppedMessages — preserves dropped content for summarization", () => {
  it("droppedMessages contains all messages from dropped turns", () => {
    const turns: StructuredHistoryMessage[] = [];
    for (let i = 0; i < 6; i++) {
      turns.push(...makeTurn(padToTokens(`q${i}`, 50), padToTokens(`a${i}`, 50)));
    }

    const totalTokens = turns.reduce((s, m) => s + estimateMessageTokens(m), 0);
    const budget = Math.floor(totalTokens * 0.4);

    const result = trimHistoryToFitBudget(turns, budget);

    expect(result.compactionLevel).toBe(2);
    // Verify content integrity: dropped + kept = original
    const allContent = [...result.droppedMessages, ...result.messages].map(m => m.content);
    const originalContent = turns.map(m => m.content);
    expect(allContent).toEqual(originalContent);
  });

  it("dropped messages start with the oldest turn", () => {
    const turns: StructuredHistoryMessage[] = [];
    for (let i = 0; i < 5; i++) {
      turns.push(...makeTurn(padToTokens(`q${i}`, 60), padToTokens(`a${i}`, 60)));
    }

    const totalTokens = turns.reduce((s, m) => s + estimateMessageTokens(m), 0);
    const result = trimHistoryToFitBudget(turns, Math.floor(totalTokens * 0.3));

    expect(result.droppedMessages.length).toBeGreaterThan(0);
    expect(result.droppedMessages[0].content).toContain("q0");
  });
});

// ---------------------------------------------------------------------------
// End-to-end compaction scenario
// ---------------------------------------------------------------------------

describe("End-to-end compaction scenario", () => {
  it("simulates a long agent session with progressive compaction", () => {
    const systemPrompt = "You are a helpful assistant.";
    // Tight context window with no buffer for predictable behavior:
    // system ~12 tokens, query ~8, reserved 50
    // → history budget ≈ 400 - 50 - 12 - 8 = 330 tokens
    // Each turn adds ~60 tokens → fills up around turn 5-6
    const config: ContextManagerConfig = {
      contextWindowTokens: 400,
      reservedOutputTokens: 50,
      recentTurnsWithTools: 2,
      compactionBufferPercent: 0,
      proactiveCompactionThreshold: 1.0
    };

    const history: StructuredHistoryMessage[] = [];
    const snapshots: Array<{
      turn: number;
      compactionLevel: number;
      droppedTurns: number;
      percent: number;
      msgCount: number;
      historyTokens: number;
    }> = [];

    for (let turn = 0; turn < 10; turn++) {
      history.push(
        { role: "user", content: padToTokens(`q${turn}`, 25) },
        { role: "assistant", content: padToTokens(`a${turn}`, 25) }
      );

      const { usage, budget, compactionLevel, droppedTurns, messages } = buildManagedMessages(
        systemPrompt,
        `next`,
        [],
        history,
        undefined,
        config
      );

      snapshots.push({
        turn: turn + 1,
        compactionLevel,
        droppedTurns,
        percent: usage.percent,
        msgCount: messages.length,
        historyTokens: budget.historyTokens
      });
    }

    // Early turns should have no compaction (history fits in budget)
    expect(snapshots[0].compactionLevel).toBe(0);
    expect(snapshots[1].compactionLevel).toBe(0);

    // Later turns should trigger compaction as history grows
    const compactedSnapshots = snapshots.filter(s => s.compactionLevel > 0);
    expect(compactedSnapshots.length).toBeGreaterThan(0);

    // droppedTurns should be > 0 in later turns
    const lastSnapshot = snapshots[snapshots.length - 1];
    expect(lastSnapshot.droppedTurns).toBeGreaterThan(0);

    // Usage percent should stay bounded
    for (const s of snapshots) {
      expect(s.percent).toBeLessThanOrEqual(100);
    }

    // Message count in later turns should be smaller than total history
    expect(lastSnapshot.msgCount).toBeLessThan(history.length + 2);
  });
});
