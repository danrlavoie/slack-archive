import type { Channel, Users } from '../types/slack';

interface HeaderProps {
  channel: Channel;
  users: Users;
}

/**
 * Header component to display the channel name and topic.
 * @param {Channel} channel - The channel object containing the name and topic.
 * @returns {JSX.Element} - Returns a header element with the channel name and topic.
 * @example
 * <Header channel={channel} />
 */
export const Header = ({ channel }: HeaderProps) => {
  return (
    <div className="header">
      <h1># {channel.name}</h1>
      {channel.topic?.value && (
        <p className="topic">{channel.topic.value}</p>
      )}
    </div>
  );
};