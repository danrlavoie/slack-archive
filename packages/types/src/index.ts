import { z } from "zod";

// ---------------------------------------------------------------------------
// Re-exports from @slack/web-api (too large for hand-written Zod schemas)
// ---------------------------------------------------------------------------

export type {
  MessageElement,
  MessageElement as Message,
  FileElement,
  FileElement as File,
} from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";

export type { Channel } from "@slack/web-api/dist/types/response/ConversationsListResponse.js";

export type { User } from "@slack/web-api/dist/types/response/UsersInfoResponse.js";

export type { Reaction } from "@slack/web-api/dist/types/response/ReactionsGetResponse.js";

export type { AuthTestResponse } from "@slack/web-api";

// ---------------------------------------------------------------------------
// Convenience type aliases
// ---------------------------------------------------------------------------

import type { User } from "@slack/web-api/dist/types/response/UsersInfoResponse.js";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";

export type Users = Record<string, User>;

// ---------------------------------------------------------------------------
// Zod schemas — domain types owned by this project
// ---------------------------------------------------------------------------

export const EmojisSchema = z.record(z.string(), z.string());
export type Emojis = z.infer<typeof EmojisSchema>;

/** A message with its thread replies inlined. */
export interface ArchiveMessage extends MessageElement {
  replies?: Array<MessageElement>;
}

/** Loose attachment shape — Slack's built-in type is too restrictive. */
export interface Attachment {
  id?: string;
  service_icon?: string;
  service_name?: string;
  title?: string;
  title_link?: string;
  image_url?: string;
  thumb_url?: string;
  text?: string;
}

export const SlackArchiveChannelDataSchema = z.object({
  messages: z.number(),
  fullyDownloaded: z.boolean(),
});
export type SlackArchiveChannelData = z.infer<typeof SlackArchiveChannelDataSchema>;

export const SlackArchiveDataSchema = z.object({
  channels: z.record(z.string(), SlackArchiveChannelDataSchema),
  auth: z.unknown().optional(),
});
export type SlackArchiveData = z.infer<typeof SlackArchiveDataSchema>;

export const SearchMessageSchema = z.object({
  m: z.string().optional(), // Message text
  u: z.string().optional(), // User ID
  t: z.string().optional(), // Timestamp
  c: z.string().optional(), // Channel ID
});
export type SearchMessage = z.infer<typeof SearchMessageSchema>;

export type SearchPageIndex = Record<string, Array<string>>;

export const SearchFileSchema = z.object({
  users: z.record(z.string(), z.string()),
  channels: z.record(z.string(), z.string()),
  messages: z.record(z.string(), z.array(SearchMessageSchema)),
  pages: z.record(z.string(), z.array(z.string())),
});
export type SearchFile = z.infer<typeof SearchFileSchema>;

/** Backend search index — flat record keyed by message ID. */
export const SearchIndexSchema = z.record(
  z.string(),
  z.object({
    text: z.string(),
    file: z.string(),
    ts: z.string().optional(),
  }),
);
export type SearchIndex = z.infer<typeof SearchIndexSchema>;

/** Per-chunk metadata used during incremental archiving. */
export interface ChunkInfo {
  oldest?: string;
  newest?: string;
  count: number;
}

export type ChunksInfo = Array<ChunkInfo>;
