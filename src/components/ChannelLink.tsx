import React from "react";
import { Channel, SlackArchiveData, User, Users } from "../interfaces.js";
import { Avatar } from "./Avatar.js";

interface ChannelLinkProps {
  channel: Channel;
  me: User | null;
  users: Users;
  base: string;
  slackArchiveData: SlackArchiveData;
}
export const ChannelLink: React.FunctionComponent<ChannelLinkProps> = ({
  channel,
  me,
  users,
  base,
  slackArchiveData
}) => {
  let name = channel.name || channel.id;
  let leadSymbol = <span># </span>;

  const channelData = slackArchiveData.channels[channel.id!];
  if (channelData && channelData.messages === 0) {
    return null;
  }

  // Remove the user's name from the group mpdm channel name
  if (me && channel.is_mpim) {
    name = name?.replace(`@${me.name}`, "").replace("  ", " ");
  }

  if (channel.is_im && (channel as any).user) {
    leadSymbol = <Avatar userId={(channel as any).user} users={users} base={base}/>;
  }

  if (channel.is_mpim) {
    leadSymbol = <></>;
    name = name?.replace("Group messaging with: ", "");
  }

  return (
    <li key={name}>
      <a title={name} href={`html/${channel.id!}-0.html`} target="iframe">
        {leadSymbol}
        <span>{name}</span>
      </a>
    </li>
  );
};
