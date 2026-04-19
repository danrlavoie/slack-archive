import type { ArchiveMessage, PaginatedMessages } from '@slack-archive/types';

interface CursorParams {
  before?: string;
  after?: string;
  around?: string;
}

function ensureAscending(messages: ArchiveMessage[]): ArchiveMessage[] {
  if (messages.length < 2) return messages;
  const first = parseFloat(messages[0].ts || '0');
  const last = parseFloat(messages[messages.length - 1].ts || '0');
  if (first > last) {
    return [...messages].reverse();
  }
  return messages;
}

function findInsertionIndex(messages: ArchiveMessage[], ts: string): number {
  const target = parseFloat(ts);
  let lo = 0;
  let hi = messages.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (parseFloat(messages[mid].ts || '0') < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function paginateMessages(
  rawMessages: ArchiveMessage[],
  cursor: CursorParams,
  limit: number,
): PaginatedMessages {
  const messages = ensureAscending(rawMessages);

  if (messages.length === 0) {
    return { messages: [], hasOlder: false, hasNewer: false, oldestTs: '', newestTs: '' };
  }

  let start: number;
  let end: number;

  if (cursor.around) {
    const idx = findInsertionIndex(messages, cursor.around);
    const half = Math.floor(limit / 2);
    start = Math.max(0, idx - half);
    end = Math.min(messages.length, start + limit);
    // Re-adjust start if we hit the end boundary
    start = Math.max(0, end - limit);
  } else if (cursor.before) {
    const idx = findInsertionIndex(messages, cursor.before);
    end = idx; // exclusive — don't include the cursor message
    start = Math.max(0, end - limit);
  } else if (cursor.after) {
    const idx = findInsertionIndex(messages, cursor.after);
    // Skip past any message with exactly this ts
    start = idx < messages.length && messages[idx].ts === cursor.after ? idx + 1 : idx;
    end = Math.min(messages.length, start + limit);
  } else {
    // No cursor — newest page
    end = messages.length;
    start = Math.max(0, end - limit);
  }

  const page = messages.slice(start, end);

  return {
    messages: page,
    hasOlder: start > 0,
    hasNewer: end < messages.length,
    oldestTs: page.length > 0 ? page[0].ts || '' : '',
    newestTs: page.length > 0 ? page[page.length - 1].ts || '' : '',
  };
}
