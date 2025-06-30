import express from 'express';
import cors from 'cors';
import { 
  getChannels, 
  getMessages, 
  getUsers, 
  getEmoji, 
  getSearchFile,
  getEmojiFile 
} from './utils/data-load.js';
import { STATIC_DIR, EMOJIS_DIR } from './config.js';

const app = express();
const port = process.env.PORT || 3001;

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

app.get('/api/emoji/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const emojiPath = await getEmojiFile(name);
    if (!emojiPath) {
      return res.status(404).json({ error: 'Emoji not found' });
    }
    res.sendFile(emojiPath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emoji' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});