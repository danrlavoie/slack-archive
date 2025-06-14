import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { 
  getChannels, 
  getMessages, 
  getUsers, 
  getEmoji, 
  getSearchFile 
} from './utils/data-load.js';
import { STATIC_DIR } from './config.js';

const app = express();
const port = process.env.PORT || 3001;
// TODO: fix this path
const EMOJIS_DIR = path.join(process.cwd(), 'public', 'emojis');

app.use(cors());
app.use(express.json());
// Add this line to serve static files
app.use('/static', express.static(STATIC_DIR));

// API Routes
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await getChannels();
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.get('/api/messages/:channelId', async (req, res) => {
  try {
    const messages = await getMessages(req.params.channelId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/emoji', async (req, res) => {
  try {
    const emoji = await getEmoji();
    res.json(emoji);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emoji' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const searchData = await getSearchFile();
    res.json(searchData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch search data' });
  }
});

// Removed the file serving endpoint as per the suggestion

app.get('/api/emoji/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const emojiPath = path.join(EMOJIS_DIR, `${name}`);
    // Try common extensions
    for (const ext of ['.png', '.gif', '.jpg']) {
      const fullPath = `${emojiPath}${ext}`;
      if (fs.existsSync(fullPath)) {
        return res.sendFile(fullPath);
      }
    }
    res.status(404).json({ error: 'Emoji not found' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emoji' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});