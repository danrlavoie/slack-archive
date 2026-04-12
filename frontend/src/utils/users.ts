import type { Users } from "@slack-archive/types";

export function getName(userId: string | undefined, users: Users) {
  if (!userId) return "Unknown User";
  const user = users[userId];
  if (!user) return userId;

  return user.profile?.display_name || user.profile?.real_name || user.name;
}