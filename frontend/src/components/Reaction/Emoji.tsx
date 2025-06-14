import { getEmojiUrl } from '../../api/slack';
import { isEmojiUnicode, getEmojiUnicode } from '../../utils/emoji';

interface EmojiProps {
  name: string;
}

/**
 * Emoji component renders an emoji based on its name.
 * @param {string} name - The name of the emoji to be displayed.
 * If the name is a Unicode emoji, it renders the Unicode character directly.
 * If the name is a custom emoji, it fetches the emoji data and renders it as an image.
 * @returns {JSX.Element} - Returns an image element for custom emojis or a Unicode character for Unicode emojis.
 * @example
 * <Emoji name="smile" />
 * <Emoji name="😀" />
 */
export const Emoji = ({ name }: EmojiProps) => {
  if (isEmojiUnicode(name)) {
    return <>{getEmojiUnicode(name)}</>;
  }

  return <img src={getEmojiUrl(name)} alt={name} className="emoji" />;
};