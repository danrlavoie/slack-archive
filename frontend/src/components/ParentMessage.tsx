import type { ArchiveMessage as MessageType, Users } from '@slack-archive/types';
import { Message } from './Message';
import { Files } from './Files';
import { Reaction } from './Reaction/Reaction';

interface ParentMessageProps {
  message: MessageType;
  channelId: string;
  users: Users;
}

/**
 * ParentMessage component to display a message and its replies, files, and reactions.
 * It recursively renders replies as nested ParentMessage components.
 * @param {MessageType} message - The Slack message data to be rendered, which may include replies.
 * @param {string} channelId - The ID of the channel where the message is located.
 * @param {Users} users - An object containing user profiles keyed by user ID.
 * @returns {JSX.Element} - Returns a JSX element representing the parent message with its replies, files, and reactions.
 * @example
 * <ParentMessage message={message} channelId="C12345678" users={users} />
 */
export const ParentMessage = ({ message, channelId, users }: ParentMessageProps) => {
  const hasFiles = !!message.files?.length;

  return (
    <div className="parent-message">
      <Message message={message} users={users} />
      {hasFiles && <Files message={message} channelId={channelId} />}
      {message.reactions?.map((reaction) => (
        <Reaction
          key={reaction.name}
          reaction={reaction}
          users={users}
        />
      ))}
      {message.replies?.map((reply) => (
        <ParentMessage
          key={reply.ts}
          message={reply}
          channelId={channelId}
          users={users}
        />
      ))}
    </div>
  );
};