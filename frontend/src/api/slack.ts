import axios from 'axios';
import type { ArchiveMessage, Channel, Users, Emojis, SearchIndex } from '@slack-archive/types';

const api = axios.create({
  baseURL: '/api'
});

export const getChannels = async (): Promise<Channel[]> => {
  const { data } = await api.get('/channels');
  return data;
};

export const getMessages = async (channelId: string): Promise<ArchiveMessage[]> => {
  const { data } = await api.get(`/messages/${channelId}`);
  return data;
};

export const getUsers = async (): Promise<Users> => {
  const { data } = await api.get('/users');
  return data;
};

export const getEmoji = async (): Promise<Emojis> => {
  const { data } = await api.get('/emoji');
  return data;
};

export const getFileUrl = (channelId: string, fileId: string, fileType: string): string => {
  return `/static/files/${channelId}/${fileId}.${fileType}`;
};

export const getEmojiUrl = (name: string): string => {
  return `/api/emoji/${name}`;
};

export const getSearchIndex = async (): Promise<SearchIndex> => {
  const { data } = await api.get('/search');
  return data;
};
