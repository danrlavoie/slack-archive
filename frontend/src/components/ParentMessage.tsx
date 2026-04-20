import type { ArchiveMessage as MessageType, Users } from '@slack-archive/types';
import { Link, useParams } from 'react-router-dom';
import { Message } from './Message';
import { Reaction } from './Reaction/Reaction';
import { formatRelativeDate } from '../utils/relativeDate';

interface ParentMessageProps {
  message: MessageType;
  channelId: string;
  users: Users;
}

export const ParentMessage = ({ message, channelId, users }: ParentMessageProps) => {
  const { workspaceId } = useParams();
  const replyCount = message.replies?.length ?? 0;

  return (
    <div className="parent-message">
      <Message message={message} channelId={channelId} users={users} />
      {message.reactions?.map((reaction) => (
        <Reaction
          key={reaction.name}
          reaction={reaction}
          users={users}
        />
      ))}
      {replyCount > 0 && (
        <div className="thread-link">
          <Link to={`/ws/${workspaceId}/c/${channelId}/t/${message.ts}`}>
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            {message.latest_reply && (
              <span className="thread-latest"> · {formatRelativeDate(message.latest_reply)}</span>
            )}
          </Link>
        </div>
      )}
    </div>
  );
};
