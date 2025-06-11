import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getMessages, getUsers } from '../api/slack';
import { Header } from './Header';
import { Message } from './Message';

export const ChannelView = () => {
  const { channelId } = useParams();

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => getMessages(channelId!),
    enabled: !!channelId
  });

  const { data: users = {} } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers
  });

  // Find the current channel from the sidebar context
  const { data: channels = [] } = useQuery({
    queryKey: ['channels']
  });
  
  const channel = channels.find(c => c.id === channelId);

  if (!channel) {
    return <div id="messages">Channel not found</div>;
  }

  return (
    <div id="messages">
      <Header channel={channel} users={users} />
      
      <div className="messages-list">
        {messages.length === 0 ? (
          <span>No messages were ever sent!</span>
        ) : (
          messages.map(message => (
            <Message
              key={message.ts}
              message={message}
              users={users}
            />
          ))
        )}
      </div>
    </div>
  );
};