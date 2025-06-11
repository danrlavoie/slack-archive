import axios from 'axios';
import { Channel, Message, Users } from '../types/slack';

const api = axios.create({
  baseURL: 'http://localhost:3001/api'
});

export const getChannels = async (): Promise<Channel[]> => {
  const { data } = await api.get('/channels');
  return data;
};

export const getMessages = async (channelId: string): Promise<Message[]> => {
  const { data } = await api.get(`/messages/${channelId}`);
  return data;
};

export const getUsers = async (): Promise<Users> => {
  const { data } = await api.get('/users');
  return data;
};