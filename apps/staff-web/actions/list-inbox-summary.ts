import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { ne, sql, count } from "drizzle-orm";

export default defineAction({
  description:
    "Summarise the WhatsApp inbox — unread conversation count and open conversation count. " +
    "Used by the noticeboard Inbox card subheading and for 'how many unread?' questions. " +
    "Excludes lead conversations (status='lead'). Returns { unreadConversations, openConversations, asOf }.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    const [unreadRow] = await db
      .select({
        c: sql<number>`COUNT(*) FILTER (WHERE ${schema.conversations.unreadCount} > 0)`,
      })
      .from(schema.conversations)
      .where(ne(schema.conversations.status, "lead"));
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    const [openRow] = await db
      .select({ c: count() })
      .from(schema.conversations)
      .where(ne(schema.conversations.status, "lead"));
    return {
      unreadConversations: Number(unreadRow?.c ?? 0),
      openConversations: Number(openRow?.c ?? 0),
      asOf: new Date().toISOString(),
    };
  },
});
