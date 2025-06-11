import type { Users } from '../types/slack';

interface AvatarProps {
  userId: string;
  users: Users;
}

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