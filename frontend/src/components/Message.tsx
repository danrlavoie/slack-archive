import type { Message as MessageType, Users } from '../types/slack';
import { Avatar } from './Avatar';
import { Attachment } from './Attachment';
import { formatTimestamp } from '../utils/timestamp';
import { getName } from '../utils/users';
import { SlackText } from './SlackText';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface MessageProps {
  message: MessageType;
  users: Users;
}

/**
 * Message component to display a single Slack message.
 * It includes the user's avatar, username, timestamp, text content,
 * and any attachments associated with the message.
 * @param {MessageType} message - The Slack message data to be rendered
 * @param {Users} users - An object containing user profiles keyed by user ID.
 * @returns {JSX.Element} - Returns a JSX element representing the message.
 * @example
 * <Message message={message} users={users} />
 */
export const Message = ({ message, users }: MessageProps) => {
  const username = getName(message.user, users);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Handle clicking on timestamp
  const handleTimestampClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const messageId = message.ts;
    if (!messageId) return;
    // Update URL with message timestamp
    navigate(`${location.pathname}#${messageId}`, { replace: true });
    // Scroll message into view
    document.getElementById(messageId)?.scrollIntoView({ behavior: 'smooth' });
  };

  // Check if this message is targeted in URL on load
  useEffect(() => {
    const messageId = message.ts;
    if (!messageId) return;
    if (location.hash === `#${messageId}`) {
      document.getElementById(messageId)?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash, message.ts]);

  const attachments = message.attachments?.map((attachment) => (
    <Attachment key={attachment.id} {...attachment} />
  ));

  return (
    <div className="message-gutter" id={message.ts}>
      <div className="" data-stringify-ignore="true">
        <Avatar userId={message.user} users={users} />
      </div>
      <div className="">
        <span className="sender">{username}</span>
        <span 
          className="timestamp" 
          onClick={handleTimestampClick}
          style={{ cursor: 'pointer' }}
        >
          {formatTimestamp(message)}
        </span>
        <br />
        <div>
          <SlackText text={message.text || ''} users={users} />
          {attachments}
        </div>
      </div>
    </div>
  );
};