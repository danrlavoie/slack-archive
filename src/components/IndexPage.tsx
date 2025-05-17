import React from "react";
import { sortBy } from "lodash-es";
import { Channel, SlackArchiveData, User, Users } from "../interfaces.js";
import {
  isBotChannel,
  isDmChannel,
  isPrivateChannel,
  isPublicChannel,
} from "../channels.js";
import { ChannelLink } from "./ChannelLink.js";
import { HtmlPage } from "./HtmlPage.js";

interface IndexPageProps {
  channels: Array<Channel>;
  users: Users;
  me: User | null;
  base: string;
  slackArchiveData: SlackArchiveData;
}
export const IndexPage: React.FunctionComponent<IndexPageProps> = (props) => {
  const { channels, users, me, base, slackArchiveData } = props;
  const sortedChannels = sortBy(channels, "name");

  const publicChannels = sortedChannels
    .filter((channel) => isPublicChannel(channel) && !channel.is_archived)
    .map((channel) => (
      <ChannelLink key={channel.id} channel={channel} me={me} users={users} base={base} slackArchiveData={slackArchiveData} />
    ));

  const publicArchivedChannels = sortedChannels
    .filter((channel) => isPublicChannel(channel) && channel.is_archived)
    .map((channel) => (
      <ChannelLink key={channel.id} channel={channel} me={me} users={users} base={base} slackArchiveData={slackArchiveData} />
    ));

  const privateChannels = sortedChannels
    .filter((channel) => isPrivateChannel(channel) && !channel.is_archived)
    .map((channel) => (
      <ChannelLink key={channel.id} channel={channel} me={me} users={users} base={base} slackArchiveData={slackArchiveData} />
    ));

  const privateArchivedChannels = sortedChannels
    .filter((channel) => isPrivateChannel(channel) && channel.is_archived)
    .map((channel) => (
      <ChannelLink key={channel.id} channel={channel} me={me} users={users} base={base} slackArchiveData={slackArchiveData} />
    ));

  const dmChannels = sortedChannels
    .filter(
      (channel) => isDmChannel(channel, users) && !users[channel.user!].deleted
    )
    .sort((a, b) => {
      // Self first
      if (me && a.user && a.user === me.id) {
        return -1;
      }

      // Then alphabetically
      return (a.name || "Unknown").localeCompare(b.name || "Unknown");
    })
    .map((channel) => (
      <ChannelLink key={channel.id} channel={channel} me={me} users={users} base={base} slackArchiveData={slackArchiveData} />
    ));

  const dmDeletedChannels = sortedChannels
    .filter(
      (channel) => isDmChannel(channel, users) && users[channel.user!].deleted
    )
    .sort((a, b) => (a.name || "Unknown").localeCompare(b.name || "Unknown"))
    .map((channel) => (
      <ChannelLink key={channel.id} channel={channel} me={me} users={users} base={base} slackArchiveData={slackArchiveData} />
    ));

  const groupChannels = sortedChannels
    .filter((channel) => channel.is_mpim)
    .map((channel) => (
      <ChannelLink key={channel.id} channel={channel} me={me} users={users} base={base} slackArchiveData={slackArchiveData} />
    ));

  const botChannels = sortedChannels
    .filter((channel) => isBotChannel(channel, users))
    .sort((a, b) => {
      if (a.name && b.name) {
        return a.name!.localeCompare(b.name!);
      }

      return 1;
    })
    .map((channel) => (
      <ChannelLink key={channel.id} channel={channel} me={me} users={users} base={base} slackArchiveData={slackArchiveData} />
    ));

  return (
    <HtmlPage base={base}>
      <div id="index">
        <div id="channels">
          <p className="section">Public Channels</p>
          <ul>{publicChannels}</ul>
          <p className="section">Private Channels</p>
          <ul>{privateChannels}</ul>
          <p className="section">DMs</p>
          <ul>{dmChannels}</ul>
          <p className="section">Group DMs</p>
          <ul>{groupChannels}</ul>
          <p className="section">Bots</p>
          <ul>{botChannels}</ul>
          <p className="section">Archived Public Channels</p>
          <ul>{publicArchivedChannels}</ul>
          <p className="section">Archived Private Channels</p>
          <ul>{privateArchivedChannels}</ul>
          <p className="section">DMs (Deleted Users)</p>
          <ul>{dmDeletedChannels}</ul>
        </div>
        <div id="messages">
          <iframe name="iframe" src={`html/${channels[0].id!}-0.html`} />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            const urlSearchParams = new URLSearchParams(window.location.search);
            const channelValue = urlSearchParams.get("c");
            const tsValue = urlSearchParams.get("ts");
            
            if (channelValue) {
              const iframe = document.getElementsByName('iframe')[0]
              iframe.src = "html/" + decodeURIComponent(channelValue) + '.html' + '#' + (tsValue || '');
            }
            `,
          }}
        />
      </div>
    </HtmlPage>
  );
};
