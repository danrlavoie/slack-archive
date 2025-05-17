import React from "react";
import slackMarkdown from "slack-markdown";
import { ArchiveMessage, Users } from "../interfaces.js";
import { getName } from "../users.js";
import { formatTimestamp } from "../timestamp.js";
import { Attachment } from "./Attachment.js";
import { Avatar } from "./Avatar.js";

interface MessageProps {
  message: ArchiveMessage;
  channelId: string;
  users: Users;
  base: string;
}
export const Message: React.FunctionComponent<MessageProps> = (props) => {
  const { message, users, base } = props;
  const username = getName(message.user, users);
  const slackCallbacks = {
    user: ({ id }: { id: string }) => `@${getName(id, users)}`,
  };

  const attachments = message.attachments?.map((attachment) => (
    <Attachment key={attachment.id} {...attachment} />
  ));

  return (
    <div className="message-gutter" id={message.ts}>
      <div className="" data-stringify-ignore="true">
        <Avatar userId={message.user} users={users} base={base} />
      </div>
      <div className="">
        <span className="sender">{username}</span>
        <span className="timestamp">
          <span className="c-timestamp__label">{formatTimestamp(message)}</span>
        </span>
        <br />
        <div>
          <div
            className="text"
            dangerouslySetInnerHTML={{
              __html: slackMarkdown.toHTML(message.text, {
                escapeHTML: false,
                slackCallbacks,
              }),
            }}
          />
          {props.children}
        </div>
        {attachments}
      </div>
    </div>
  );
};
