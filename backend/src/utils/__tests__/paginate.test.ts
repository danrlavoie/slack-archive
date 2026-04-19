import { describe, test, expect } from 'vitest';
import { paginateMessages } from '../paginate.js';
import type { ArchiveMessage } from '@slack-archive/types';

function makeMessages(count: number): ArchiveMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    ts: `${1000 + i}.000000`,
    type: 'message',
    text: `msg-${i}`,
  })) as ArchiveMessage[];
}

// Input may be in any order — utility must normalize to ascending
function reversed(msgs: ArchiveMessage[]): ArchiveMessage[] {
  return [...msgs].reverse();
}

describe('paginateMessages', () => {
  const msgs = makeMessages(20); // ts: 1000..1019, ascending

  test('no cursor returns newest `limit` messages', () => {
    const result = paginateMessages(msgs, {}, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1015.000000', '1016.000000', '1017.000000', '1018.000000', '1019.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(false);
    expect(result.oldestTs).toBe('1015.000000');
    expect(result.newestTs).toBe('1019.000000');
  });

  test('no cursor with descending input normalizes to ascending', () => {
    const result = paginateMessages(reversed(msgs), {}, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1015.000000', '1016.000000', '1017.000000', '1018.000000', '1019.000000',
    ]);
  });

  test('before cursor returns messages older than ts', () => {
    const result = paginateMessages(msgs, { before: '1010.000000' }, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1005.000000', '1006.000000', '1007.000000', '1008.000000', '1009.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(true);
  });

  test('before cursor near start sets hasOlder false', () => {
    const result = paginateMessages(msgs, { before: '1003.000000' }, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1000.000000', '1001.000000', '1002.000000',
    ]);
    expect(result.hasOlder).toBe(false);
    expect(result.hasNewer).toBe(true);
  });

  test('after cursor returns messages newer than ts', () => {
    const result = paginateMessages(msgs, { after: '1010.000000' }, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1011.000000', '1012.000000', '1013.000000', '1014.000000', '1015.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(true);
  });

  test('after cursor near end sets hasNewer false', () => {
    const result = paginateMessages(msgs, { after: '1016.000000' }, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1017.000000', '1018.000000', '1019.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(false);
  });

  test('around cursor centers on the target ts', () => {
    const result = paginateMessages(msgs, { around: '1010.000000' }, 6);
    // 6 messages centered on index 10: 3 before + target + 2 after = indices 7..12
    expect(result.messages.map(m => m.ts)).toEqual([
      '1007.000000', '1008.000000', '1009.000000',
      '1010.000000',
      '1011.000000', '1012.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(true);
  });

  test('around with ts not in array uses nearest position', () => {
    const result = paginateMessages(msgs, { around: '1010.500000' }, 4);
    // 1010.5 falls between index 10 and 11; insertion point is 11
    // center around 11: 2 before + 2 at/after = indices 9..12
    expect(result.messages.map(m => m.ts)).toEqual([
      '1009.000000', '1010.000000', '1011.000000', '1012.000000',
    ]);
  });

  test('empty messages array returns empty result', () => {
    const result = paginateMessages([], {}, 5);
    expect(result.messages).toEqual([]);
    expect(result.hasOlder).toBe(false);
    expect(result.hasNewer).toBe(false);
    expect(result.oldestTs).toBe('');
    expect(result.newestTs).toBe('');
  });

  test('limit larger than total returns all messages', () => {
    const result = paginateMessages(msgs, {}, 100);
    expect(result.messages.length).toBe(20);
    expect(result.hasOlder).toBe(false);
    expect(result.hasNewer).toBe(false);
  });
});
