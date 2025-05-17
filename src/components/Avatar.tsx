import React from "react";
import path from "path";
import { Users } from "../interfaces";
interface AvatarProps {
  userId?: string;
  users: Users;
  base: string;
}
export const Avatar: React.FunctionComponent<AvatarProps> = ({ userId, users, base }) => {
  if (!userId) return null;

  const user = users[userId];
  if (!user || !user.profile || !user.profile.image_512) return null;

  const ext = path.extname(user?.profile?.image_512!);
  const src = `${base}avatars/${userId}${ext}`;

  return <img className="avatar" src={src} />;
};