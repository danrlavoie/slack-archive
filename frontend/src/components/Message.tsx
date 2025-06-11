import type { Message as MessageType, Users } from '../types/slack';
import { Avatar } from './Avatar';
import { Attachment } from './Attachment';
import { formatTimestamp } from '../utils/timestamp';

interface MessageProps {
  message: MessageType;
  users: Users;
}

function getName(userId: string | undefined, users: Users) {
  if (!userId) return "Unknown";
  const user = users[userId];
  if (!user) return userId;

  return user.profile?.display_name || user.profile?.real_name || user.name;
}

export const Message = ({ message, users }: MessageProps) => {
  const username = getName(message.user, users);
  
  const attachments = message.attachments?.map((attachment) => (
    <Attachment key={attachment.id} {...attachment} />
  ));

  return (
    <div className="message-gutter" id={message.ts}>
      <div className="" data-stringify-ignore="true">
        <Avatar userId={message.user} users={users} />
      </div>
      <div className="">
        <span className="sender">{username || 'Unknown User'}</span>
        <span className="timestamp">
          <span className="c-timestamp__label">
            {formatTimestamp(message)}
          </span>
        </span>
        <br />
        <div>
          <div className="text">
            {message.text}
          </div>
          {attachments}
        </div>
      </div>
    </div>
  );
};