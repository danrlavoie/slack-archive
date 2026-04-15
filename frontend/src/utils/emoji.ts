const _unicodeEmoji: Record<string, string> = {};

// We'll need to install and import emoji-datasource
import emojiData from 'emoji-datasource';

export function initUnicodeEmoji() {
  for (const emoji of emojiData) {
    _unicodeEmoji[emoji.short_name as string] = emoji.unified;
  }
}

export function isEmojiUnicode(name: string) {
  return !!_unicodeEmoji[name];
}

export function getEmojiUnicode(name: string) {
  const unified = _unicodeEmoji[name];
  if (!unified) return '';
  
  const split = unified.split("-");
  return split
    .map((code) => String.fromCodePoint(parseInt(code, 16)))
    .join("");
}