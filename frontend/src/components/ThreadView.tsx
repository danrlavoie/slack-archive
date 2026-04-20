import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { getChannels, getMessages, getUsers } from '../api/slack';
import { Header } from './Header';
import { Message } from './Message';
import { Reaction } from './Reaction/Reaction';
import { useMessageAnchor } from '../hooks/useMessageAnchor';

export const ThreadView = () => {
  const { workspaceId, channelId, threadTs } = useParams();

  const { isLoading, data: messagesData } = useQuery({
    queryKey: ['messages', channelId, threadTs],
    queryFn: () => getMessages(channelId!, threadTs ? { around: threadTs } : undefined),
    enabled: !!channelId
  });

  const messages = messagesData?.messages ?? [];

  const { data: users = {} } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: getChannels
  });

  const channel = channels.find(c => c.id === channelId);
  const parentMessage = messages.find(m => m.ts === threadTs);

  useMessageAnchor(isLoading);

  if (isLoading) {
    return <div id="messages"><div className="loading">Loading thread...</div></div>;
  }

  if (!channel) {
    return <div id="messages">Channel not found</div>;
  }

  if (!parentMessage) {
    return (
      <div id="messages">
        <Header channel={channel} users={users} />
        <div className="thread-not-found">
          Thread not found.{' '}
          <Link to={`/ws/${workspaceId}/c/${channelId}`}>Back to channel</Link>
        </div>
      </div>
    );
  }

  const replies = parentMessage.replies ?? [];

  return (
    <div id="messages">
      <Header channel={channel} users={users} />
      <div className="thread-header">
        <Link to={`/ws/${workspaceId}/c/${channelId}`}>&larr; Back to #{channel.name}</Link>
        <span className="thread-info">Thread &middot; {replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
      </div>

      <div className="messages-list">
        <div className="thread-parent">
          <Message message={parentMessage} channelId={channelId!} users={users} />
          {parentMessage.reactions?.map((reaction) => (
            <Reaction
              key={reaction.name}
              reaction={reaction}
              users={users}
            />
          ))}
        </div>

        {replies.length > 0 && (
          <div className="thread-replies">
            <div className="thread-divider">
              <span>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
            </div>
            {replies.map(reply => (
              <div key={reply.ts} className="thread-reply">
                <Message message={reply} channelId={channelId!} users={users} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
