import React from "react";
import { getEmojiFilePath, getEmojiUnicode, isEmojiUnicode } from "../emoji.js";

interface EmojiProps {
  name: string;
}
export const Emoji: React.FunctionComponent<EmojiProps> = ({ name }) => {
  if (isEmojiUnicode(name)) {
    return <>{getEmojiUnicode(name)}</>;
  }

  return <img src={getEmojiFilePath(name)} />;
};
