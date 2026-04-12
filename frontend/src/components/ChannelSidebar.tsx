import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useParams } from 'react-router-dom';
import { sortBy } from 'lodash-es';
import { getChannels, getUsers } from '../api/slack';
import type { Channel, Users } from '@slack-archive/types';
import {
  isBotChannel,
  isDmChannel,
  isPrivateChannel,
  isPublicChannel,
} from '../utils/channels';

/**
 * ChannelLink component renders a link to a specific channel.
 * It highlights the link if the channel is currently active (i.e., the channelId matches).
 * @param {Channel} channel - The channel object containing details like id, name, and user (for DMs).
 * @param {Users} users - An object containing user profiles keyed by user ID.
 * @returns {JSX.Element} - Returns a link to the channel with an avatar if it's a DM channel.
 * @example
 * <ChannelLink channel={channel} users={users} />
 */
const ChannelLink = ({ channel, users }: { channel: Channel; users: Users }) => {
  const { channelId } = useParams();
  const isActive = channelId === channel.id;
  
  return (
    <Link 
      to={`/channels/${channel.id}`}
      className={isActive ? 'active' : ''}
    >
      {isDmChannel(channel, users) && users[channel.user!]?.profile?.image_512 && (
        <img
          className="avatar"
          src={users[channel.user!]?.profile?.image_512}
          alt={users[channel.user!].name}
        />
      )}
      <span># {channel.name}</span>
    </Link>
  );
};

/**
 * ChannelSidebar component displays a sidebar with links to different types of channels.
 * It sorts channels into categories as is done in the regular Slack UI.
 * The channel links are then used to route to the specific channel view when clicked.
 * @param {void}
 * @returns {JSX.Element} - Returns a sidebar with categorized channel links.
 * @example
 * <ChannelSidebar />
 */
export const ChannelSidebar = () => {
  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: getChannels
  });

  const { data: users = {} } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers
  });

  const sortedChannels = sortBy(channels, "name");

  const publicChannels = sortedChannels
    .filter((channel) => isPublicChannel(channel) && !channel.is_archived)
    .map((channel) => (
      <li key={channel.id}>
        <ChannelLink channel={channel} users={users} />
      </li>
    ));

  const privateChannels = sortedChannels
    .filter((channel) => isPrivateChannel(channel) && !channel.is_archived)
    .map((channel) => (
      <li key={channel.id}>
        <ChannelLink channel={channel} users={users} />
      </li>
    ));

  const dmChannels = sortedChannels
    .filter(
      (channel) => isDmChannel(channel, users) && !users[channel.user!]?.deleted
    )
    .map((channel) => (
      <li key={channel.id}>
        <ChannelLink channel={channel} users={users} />
      </li>
    ));

  const botChannels = sortedChannels
    .filter((channel) => isBotChannel(channel, users))
    .map((channel) => (
      <li key={channel.id}>
        <ChannelLink channel={channel} users={users} />
      </li>
    ));

  return (
    <>
      <div id="channels">
        <p className="section">Public Channels</p>
        <ul>{publicChannels}</ul>
        
        <p className="section">Private Channels</p>
        <ul>{privateChannels}</ul>
        
        <p className="section">Direct Messages</p>
        <ul>{dmChannels}</ul>
        
        <p className="section">Bots</p>
        <ul>{botChannels}</ul>

        {/* Later, could add archived channels, group DMs, etc. */}
      </div>
      
      <Outlet />
    </>
  );
};