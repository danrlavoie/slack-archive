import type { Message } from '../types/slack';

export function formatTimestamp(message: Message): string {
  const date = new Date(Number(message.ts) * 1000);
  return date.toLocaleString();
}