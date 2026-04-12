import type { Reaction as ReactionType, Users } from '@slack-archive/types';
import { Emoji } from './Emoji';

interface ReactionProps {
  reaction: ReactionType;
  users: Users;
}

/**
 * Reaction component to display a reaction with its count and the users who reacted.
 * @param {ReactionType} reaction - The reaction data containing the emoji name and count.
 * @param {Users} users - An object containing user profiles keyed by user ID.
 * @returns {JSX.Element} - Returns a JSX element representing the reaction with an emoji and count.
 * @example
 * <Reaction reaction={reaction} users={users} />
 */
export const Reaction = ({ reaction, users }: ReactionProps) => {
  const reactors = reaction.users
    ?.map(userId => users[userId]?.name || userId)
    .filter(Boolean);

  return (
    <div className="reaction" title={reactors?.join(', ')}>
      <Emoji name={reaction.name!} />
      <span>{reaction.count}</span>
    </div>
  );
};