import React from "react";
import fs from "fs-extra";
import { ArchiveMessage, Channel, ChunksInfo, Users } from "../interfaces.js";
import { MESSAGES_JS_PATH } from "../config.js";
import { Header } from "./Header.js";
import { HtmlPage } from "./HtmlPage.js";
import { ParentMessage } from "./ParentMessage.js";

interface MessagesPageProps {
  messages: Array<ArchiveMessage>;
  channel: Channel;
  index: number;
  chunksInfo: ChunksInfo;
  users: Users;
  base: string;
}
export const MessagesPage: React.FunctionComponent<MessagesPageProps> = (
  props
) => {
  const { channel, index, chunksInfo, users, base } = props;
  const messagesJs = fs.readFileSync(MESSAGES_JS_PATH, "utf8");

  // Newest message is first
  const messages = props.messages
    .map((m) => (
      <ParentMessage
        key={m.ts}
        message={m}
        channelId={channel.id!}
        users={users}
        base={base}
      />
    ))
    .reverse();

  if (messages.length === 0) {
    messages.push(<span key="empty">No messages were ever sent!</span>);
  }

  return (
    <HtmlPage base={base}>
      <div style={{ paddingLeft: 10 }}>
        <Header
          index={index}
          chunksInfo={chunksInfo}
          channel={channel}
          users={users}
        />
        <div className="messages-list">{messages}</div>
        <script dangerouslySetInnerHTML={{ __html: messagesJs }} />
      </div>
    </HtmlPage>
  );
};
