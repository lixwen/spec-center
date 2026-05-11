import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearMongoDatabase,
  closeMongoConnection,
  getMongoCollections
} from "../packages/core/src/data/mongo";
import { createId } from "../packages/core/src/utils/id";
import { nowIso } from "../packages/core/src/utils/hash";
import type { Conversation, ConversationMessage } from "../packages/core/src/domain/models";

describe("Conversation CRUD", () => {
  beforeEach(async () => {
    await clearMongoDatabase();
  });

  afterAll(async () => {
    await closeMongoConnection();
  });

  async function createTestConversation(
    overrides?: Partial<Conversation>
  ): Promise<Conversation> {
    const collections = await getMongoCollections();
    const timestamp = nowIso();
    const conv: Conversation = {
      _id: createId("conv"),
      project_id: "project-default",
      user_id: "user-1",
      title: "Test conversation",
      messages: [],
      created_at: timestamp,
      updated_at: timestamp,
      ...overrides
    };
    await collections.conversations.insertOne(conv);
    return conv;
  }

  it("creates a conversation and retrieves it", async () => {
    const conv = await createTestConversation({ title: "My first chat" });

    const collections = await getMongoCollections();
    const found = await collections.conversations.findOne({ _id: conv._id });

    expect(found).toBeTruthy();
    expect(found!.title).toBe("My first chat");
    expect(found!.user_id).toBe("user-1");
    expect(found!.messages).toEqual([]);
  });

  it("lists conversations for a user sorted by updated_at desc", async () => {
    const ts1 = "2025-01-01T00:00:00.000Z";
    const ts2 = "2025-01-02T00:00:00.000Z";
    const ts3 = "2025-01-03T00:00:00.000Z";

    await createTestConversation({ title: "Old", updated_at: ts1, created_at: ts1 });
    await createTestConversation({ title: "Middle", updated_at: ts2, created_at: ts2 });
    await createTestConversation({ title: "New", updated_at: ts3, created_at: ts3 });

    const collections = await getMongoCollections();
    const list = await collections.conversations
      .find({ user_id: "user-1", project_id: "project-default" })
      .sort({ updated_at: -1 })
      .toArray();

    expect(list).toHaveLength(3);
    expect(list[0].title).toBe("New");
    expect(list[2].title).toBe("Old");
  });

  it("isolates conversations by user_id", async () => {
    await createTestConversation({ user_id: "user-1", title: "User 1 chat" });
    await createTestConversation({ user_id: "user-2", title: "User 2 chat" });

    const collections = await getMongoCollections();
    const user1Convos = await collections.conversations
      .find({ user_id: "user-1" })
      .toArray();
    const user2Convos = await collections.conversations
      .find({ user_id: "user-2" })
      .toArray();

    expect(user1Convos).toHaveLength(1);
    expect(user1Convos[0].title).toBe("User 1 chat");
    expect(user2Convos).toHaveLength(1);
    expect(user2Convos[0].title).toBe("User 2 chat");
  });

  it("appends messages to a conversation", async () => {
    const conv = await createTestConversation();
    const collections = await getMongoCollections();

    const userMsg: ConversationMessage = {
      role: "user",
      content: "What is authentication?",
      created_at: nowIso()
    };

    await collections.conversations.updateOne(
      { _id: conv._id },
      { $push: { messages: userMsg }, $set: { updated_at: nowIso() } }
    );

    const assistantMsg: ConversationMessage = {
      role: "assistant",
      content: "Authentication is the process of verifying identity.",
      sources: [{ type: "spec", title: "auth-spec", href: "/product-specs/spec-1" }],
      created_at: nowIso()
    };

    await collections.conversations.updateOne(
      { _id: conv._id },
      { $push: { messages: assistantMsg }, $set: { updated_at: nowIso() } }
    );

    const updated = await collections.conversations.findOne({ _id: conv._id });
    expect(updated!.messages).toHaveLength(2);
    expect(updated!.messages[0].role).toBe("user");
    expect(updated!.messages[1].role).toBe("assistant");
    expect(updated!.messages[1].sources).toHaveLength(1);
  });

  it("auto-generates title from first user message (slice 50 chars)", async () => {
    const longMessage = "This is a very long question about authentication mechanisms in the system and how they work together";
    const title = longMessage.slice(0, 50);

    const conv = await createTestConversation({ title });
    expect(conv.title).toBe("This is a very long question about authentication ");
    expect(conv.title.length).toBe(50);
  });
});
