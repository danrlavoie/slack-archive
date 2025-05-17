import React from "react";
import { Reaction, Users } from "../interfaces.js";
import { getName } from "../users.js";
import { Emoji } from "./Emoji.js";

interface ReactionProps {
  reaction: Reaction;
  users: Users;
}
export const ReactionComponent: React.FunctionComponent<ReactionProps> = ({
  reaction,
  users,
}) => {
  const reactors = [];

  if (reaction.users) {
    for (const userId of reaction.users) {
      reactors.push(getName(userId, users));
    }
  }

  return (
    <div className="reaction" title={reactors.join(", ")}>
      <Emoji name={reaction.name!} />
      <span>{reaction.count}</span>
    </div>
  );
};
