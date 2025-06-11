import type { 
  MessageElement as SlackMessage,
  FileElement,
} from "@slack/web-api/dist/response/ConversationsHistoryResponse";
import type { Channel as SlackChannel } from "@slack/web-api/dist/response/ConversationsListResponse";
import type { User as SlackUser } from "@slack/web-api/dist/response/UsersInfoResponse";
import type { Reaction as SlackReaction } from "@slack/web-api/dist/response/ReactionsGetResponse";
import type { AuthTestResponse } from "@slack/web-api";

export type User = SlackUser;
export type Channel = SlackChannel;
export type Reaction = SlackReaction;
export type File = FileElement;

export interface Message extends SlackMessage {
  replies?: Array<SlackMessage>;
  thread_ts?: string;
}

// Keep our attachment interface as Slack's type is too restrictive
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

export interface Users {
  [key: string]: User;
}

export interface SlackArchiveData {
  channels: {
    [key: string]: {
      messages?: number;
      fullyDownloaded?: boolean;
    };
  };
  auth?: AuthTestResponse;
}