import {
  MAX_CHAT_STORAGE,
  restoreChatsVerified,
  type ChatSession,
} from "../jevChat";

export { MAX_CHAT_STORAGE } from "../jevChat";
const recovery =
  "Saved history needs recovery. The original data is preserved; automatic saving is paused. Export it before replacing it with the visible conversations.";

/** Every snapshot we write must fit the existing bounded reader. */
export function serializeChats(chats: ChatSession[]): string {
  const raw = JSON.stringify(chats);
  if (raw.length > MAX_CHAT_STORAGE)
    throw Error(
      "Chat storage limit reached. Export conversations and remove an older thread before saving more. Your last saved history is preserved.",
    );
  return raw;
}

/** A failed/partial restore must never authorize replacing the original data. */
export async function readChatStorage(
  raw: string | null,
): Promise<{ chats: ChatSession[]; issue: string | null }> {
  if (!raw) return { chats: [], issue: null };
  if (raw.length > MAX_CHAT_STORAGE) return { chats: [], issue: recovery };
  try {
    const original: unknown = JSON.parse(raw);
    if (!Array.isArray(original)) return { chats: [], issue: recovery };
    const chats = await restoreChatsVerified(raw);
    const complete =
      chats.length === original.length &&
      chats.every(
        (chat, i) =>
          chat.id === original[i]?.id &&
          Array.isArray(original[i]?.messages) &&
          chat.messages.length === original[i].messages.length,
      );
    return { chats, issue: complete ? null : recovery };
  } catch {
    return { chats: [], issue: recovery };
  }
}
