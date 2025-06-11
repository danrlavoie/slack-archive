import type { Channel, Users } from '../types/slack';

export function isPublicChannel(channel: Channel): boolean {
  return !channel.is_im && !channel.is_mpim && !channel.is_private;
}

export function isPrivateChannel(channel: Channel): boolean {
  return !channel.is_im && !channel.is_mpim && !! channel.is_private;
}

export function isDmChannel(channel: Channel, users: Users): boolean {
  return !!channel.is_im && channel.user! in users;
}

export function isBotChannel(channel: Channel, users: Users): boolean {
  return !!channel.is_im && !(channel.user! in users);
}