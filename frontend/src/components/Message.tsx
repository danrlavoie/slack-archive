import type { Message as MessageType, Users } from '@slack-archive/types';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from './Avatar';
import { Attachment } from './Attachment';
import { formatTimestamp } from '../utils/timestamp';
import { getName } from '../utils/users';
import { SlackText } from './SlackText';

interface MessageProps {
  message: MessageType;
  users: Users;
}

export const Message = ({ message, users }: MessageProps) => {
  const { workspaceId, channelId, threadTs } = useParams();
  const username = getName(message.user, users);

  // Build the deep link URL for this message's timestamp
  const basePath = `/ws/${workspaceId}/c/${channelId}`;
  const tsLink = threadTs
    ? `${basePath}/t/${threadTs}/m/${message.ts}`
    : `${basePath}/m/${message.ts}`;

  const attachments = message.attachments?.map((attachment) => (
    <Attachment key={attachment.id} {...attachment} />
  ));

  return (
    <div className="message-gutter" id={message.ts}>
      <div data-stringify-ignore="true">
        <Avatar userId={message.user} users={users} />
      </div>
      <div>
        <span className="sender">{username}</span>
        <Link className="timestamp" to={tsLink}>
          {formatTimestamp(message)}
        </Link>
        <br />
        <div>
          <SlackText text={message.text || ''} users={users} />
          {attachments}
        </div>
      </div>
    </div>
  );
};
