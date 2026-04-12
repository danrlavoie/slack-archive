import type { Message } from '@slack-archive/types';

export function formatTimestamp(message: Message): string {
  const date = new Date(Number(message.ts) * 1000);
  return date.toLocaleString();
}