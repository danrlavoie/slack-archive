import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getChannels, getMessages, getUsers } from '../api/slack';
import { Header } from './Header';
import { ParentMessage } from './ParentMessage';
import { useMessageAnchor } from '../hooks/useMessageAnchor';

export const ChannelView = () => {
  const { channelId } = useParams();

  const { isLoading: messagesLoading, data: messages = [] } = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => getMessages(channelId!),
    enabled: !!channelId
  });

  const { data: users = {} } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: getChannels
  });

  const channel = channels.find(c => c.id === channelId);

  useMessageAnchor(messagesLoading);

  if (!channel) {
    return <div id="messages">Channel not found</div>;
  }

  return (
    <div id="messages">
      <Header channel={channel} users={users} />
      {messagesLoading && (
        <div className="loading">Loading messages...</div>
      )}

      <div className="messages-list">
        {!messagesLoading && messages.length === 0 ? (
          <span>No messages were ever sent!</span>
        ) : (
          messages.map(message => (
            <ParentMessage
              key={message.ts}
              message={message}
              channelId={channelId!}
              users={users}
            />
          ))
        )}
      </div>
    </div>
  );
};
