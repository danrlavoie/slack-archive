import React from "react";
import { ArchiveMessage, Users } from "../interfaces.js";
import { Message } from "./Message.js";
import { ReactionComponent } from "./Reaction.js";
import { Files } from "./Files.js";

interface ParentMessageProps {
  message: ArchiveMessage;
  channelId: string;
  users: Users;
  base: string;
}
export const ParentMessage: React.FunctionComponent<ParentMessageProps> = (
  props
) => {
  const { message, channelId, users, base } = props;
  const hasFiles = !!message.files;

  return (
    <Message message={message} channelId={channelId} users={users} base={base}>
      {hasFiles ? <Files message={message} channelId={channelId} /> : null}
      {message.reactions?.map((reaction) => (
        <ReactionComponent
          key={reaction.name}
          reaction={reaction}
          users={users}
        />
      ))}
      {message.replies?.map((reply) => (
        <ParentMessage
          message={reply}
          channelId={channelId}
          key={reply.ts}
          users={users}
          base={base}
        />
      ))}
    </Message>
  );
};
