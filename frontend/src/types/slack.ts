export interface Channel {
  id?: string;
  name?: string;
  is_archived?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  topic?: {
    value?: string;
  };
  creator?: string;
  created?: number;
  user?: string;
}

export interface User {
  id: string;
  name: string;
  profile?: {
    image_512?: string;
  };
  deleted?: boolean;
}

export interface Message {
  ts: string;
  text: string;
  user: string;
  files?: Array<any>;
  reactions?: Array<any>;
  thread_ts?: string;
  replies?: Array<Message>;
  attachments?: Array<any>;
}

export interface Users {
  [key: string]: User;
}

export interface SlackArchiveData {
  channels: {
    [key: string]: {
      messages?: number;
      fullyDownloaded?: boolean;
    };
  };
  auth?: {
    user_id?: string;
  };
}