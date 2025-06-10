export interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  // Add other message properties as needed
}

export interface SlackChannel {
  id: string;
  name: string;
  // Add other channel properties as needed
}

export interface SlackUser {
  id: string;
  name: string;
  // Add other user properties as needed
}

export interface SearchData {
  users: Record<string, any>;
  channels: Record<string, any>;
  messages: Record<string, any>;
  pages: Record<string, any>;
}