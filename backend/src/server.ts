import express from 'express';
import cors from 'cors';
import fs from 'fs-extra';
import path from 'path';
import {
  getChannels,
  getMessages,
  getUsers,
  getEmoji,
  getSearchFile,
  getEmojiFile
} from './utils/data-load.js';
import { paginateMessages } from './utils/paginate.js';
import { DATA_DIR, FRONTEND_DIST_DIR } from './config.js';

const app = express();
const port = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());
app.use('/static', express.static(DATA_DIR));

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
    const { before, after, around } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 250, 1), 1000);
    const result = paginateMessages(messages, { before, after, around }, limit);
    res.json(result);
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

// SPA fallback — MUST come after all /api/* routes.
// Gated on FRONTEND_DIST_DIR existing so dev mode (where the frontend
// is served by Vite on a separate port) is unaffected.
if (fs.existsSync(FRONTEND_DIST_DIR)) {
  app.use(express.static(FRONTEND_DIST_DIR));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(FRONTEND_DIST_DIR, 'index.html'));
  });
  console.log(`Serving frontend SPA from ${FRONTEND_DIST_DIR}`);
} else {
  console.log(`FRONTEND_DIST_DIR not found at ${FRONTEND_DIST_DIR} — skipping SPA mount (dev mode)`);
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
