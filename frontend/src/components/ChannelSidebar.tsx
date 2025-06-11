import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useParams } from 'react-router-dom';
import { sortBy } from 'lodash-es';
import { getChannels, getUsers } from '../api/slack';
import type { Channel, Users } from '../types/slack';
import {
  isBotChannel,
  isDmChannel,
  isPrivateChannel,
  isPublicChannel,
} from '../utils/channels';

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