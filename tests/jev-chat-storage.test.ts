import test from "node:test";
import assert from "node:assert/strict";
import { newChat } from "../lib/jevChat";
import {
  readChatStorage,
  serializeChats,
  MAX_CHAT_STORAGE,
} from "../lib/jev-chat/storage";

test("accepted chat snapshots round-trip through the same storage budget", async () => {
  const chat = newChat();
  chat.draft = "Keep this draft";
  const result = await readChatStorage(serializeChats([chat]));
  assert.equal(result.issue, null);
  assert.equal(result.chats[0].draft, chat.draft);
});
test("oversized saved bytes are recoverable and never treated as empty writable history", async () => {
  const raw = " ".repeat(MAX_CHAT_STORAGE + 1);
  const result = await readChatStorage(raw);
  assert.equal(result.chats.length, 0);
  assert.match(result.issue!, /preserved|recover/i);
  assert.throws(
    () => serializeChats([{ ...newChat(), draft: raw }]),
    /storage|limit/i,
  );
});
test("malformed and partially invalid stored history blocks replacement", async () => {
  for (const raw of [
    "{",
    "{}",
    JSON.stringify([newChat(), { id: "invalid" }]),
  ]) {
    const result = await readChatStorage(raw);
    assert.ok(result.issue);
  }
  assert.equal((await readChatStorage(null)).issue, null);
  assert.equal((await readChatStorage("[]")).issue, null);
});
