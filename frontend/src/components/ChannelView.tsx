import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getChannels, getMessages, getUsers } from '../api/slack';
import { Header } from './Header';
import { ParentMessage } from './ParentMessage';

/**
 * ChannelView component displays the messages of a specific channel.
 * It fetches messages and users from the API and renders them along with a header.
 * @param {void}
 * @returns {JSX.Element} - Returns the channel view with messages and header.
 * @example
 * <ChannelView />
 */
export const ChannelView = () => {
  const { channelId } = useParams();

  // Fetch messages for the current channel from the API
  const { isLoading: messagesLoading, data: messages = [] } = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => getMessages(channelId!),
    enabled: !!channelId
  });

  // Fetch users from the API
  const { data: users = {} } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers
  });

  // Find the current channel from the sidebar context
  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: getChannels
  });
  
  const channel = channels.find(c => c.id === channelId);

  if (!channel) {
    return <div id="messages">Channel not found</div>;
  }

  return (
    <div id="messages">
      <Header channel={channel} users={users} />
      { messagesLoading && (
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