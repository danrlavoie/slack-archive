import type { Users } from '../types/slack';

interface AvatarProps {
  userId?: string;
  users: Users;
}

/**
 * Avatar component to display a user's profile image.
 * @param {string} userId - The ID of the user whose avatar is to be displayed.
 * @param {Users} users - An object containing user profiles keyed by user ID.
 * @returns {JSX.Element|null} - Returns an image element with the user's avatar or null if no user ID is provided or if the user does not have a profile image.
 * @example
 * <Avatar userId="U12345678" users={users} />
 */
export const Avatar = ({ userId, users }: AvatarProps) => {
  if (!userId) return null;

  const user = users[userId];
  if (!user?.profile?.image_512) return null;

  return (
    <img 
      className="avatar" 
      src={user.profile.image_512}
      alt={user.name}
    />
  );
};