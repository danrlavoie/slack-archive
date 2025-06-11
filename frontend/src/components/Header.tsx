import type { Channel, Users } from '../types/slack';

interface HeaderProps {
  channel: Channel;
  users: Users;
}

export const Header = ({ channel, users }: HeaderProps) => {
  return (
    <div className="header">
      <h1>#{channel.name}</h1>
      {channel.topic?.value && (
        <p className="topic">{channel.topic.value}</p>
      )}
    </div>
  );
};