import { format } from "date-fns";
import fs from "fs-extra";
import path from "path";
import React from "react";
import ReactDOMServer from "react-dom/server.js";
import ora, { Ora } from "ora";
import { chunk, sortBy } from "lodash-es";
import { dirname } from "path";
import { fileURLToPath } from "url";
import esMain from "es-main";
import slackMarkdown from "slack-markdown";

import { getChannels, getMessages, getUsers } from "./data-load.js";
import {
  ArchiveMessage,
  Channel,
  ChunksInfo,
  Message,
  Reaction,
  SlackArchiveData,
  User,
  Users,
} from "./interfaces.js";
import {
  getHTMLFilePath,
  INDEX_PATH,
  OUT_DIR,
  MESSAGES_JS_PATH,
  FORCE_HTML_GENERATION,
} from "./config.js";
import { slackTimestampToJavaScriptTimestamp } from "./timestamp.js";
import { recordPage } from "./search.js";
import { write } from "./data-write.js";
import { getSlackArchiveData } from "./archive-data.js";
import {
  isBotChannel,
  isDmChannel,
  isPrivateChannel,
  isPublicChannel,
} from "./channels.js";
import { IndexPage } from "./components/IndexPage.js";
import { MessagesPage } from "./components/MessagesPage.js";

const _dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGE_CHUNK = 1000;

// This used to be a prop on the components, but passing it around
// was surprisingly slow. Global variables are cool again!
// Set by createHtmlForChannels().
let users: Users = {};
let slackArchiveData: SlackArchiveData = { channels: {} };
let me: User | null;

// Little hack to switch between ./index.html and ./html/...
let base = "";

function formatTimestamp(message: Message, dateFormat = "PPPPpppp") {
  const jsTs = slackTimestampToJavaScriptTimestamp(message.ts);
  const ts = format(jsTs, dateFormat);

  return ts;
}

async function renderIndexPage() {
  base = "html/";
  const channels = await getChannels();
  const page = (
    <IndexPage
      channels={channels}
      users={users}
      me={me}
      base={base}
      slackArchiveData={slackArchiveData}
    />
  );

  return renderAndWrite(page, INDEX_PATH);
}

interface RenderMessagesPageOptions {
  channel: Channel;
  messages: Array<ArchiveMessage>;
  chunkIndex: number;
  chunksInfo: ChunksInfo;
}

function renderMessagesPage(options: RenderMessagesPageOptions, spinner: Ora) {
  const { channel, messages, chunkIndex: index, chunksInfo } = options;
  const page = (
    <MessagesPage
      channel={channel}
      messages={messages}
      index={index}
      chunksInfo={chunksInfo}
      users={users}
      base={base}
    />
  );

  const filePath = getHTMLFilePath(channel.id!, index);
  spinner.text = `${channel.name || channel.id}: Writing ${index + 1}/${
    chunksInfo.length
  } ${filePath}`;
  spinner.render();

  // Update the search index. In messages, the youngest message is first.
  if (messages.length > 0) {
    recordPage(channel.id, messages[messages.length - 1]?.ts);
  }

  return renderAndWrite(page, filePath);
}

async function renderAndWrite(page: JSX.Element, filePath: string) {
  const html = ReactDOMServer.renderToStaticMarkup(page);
  const htmlWDoc = "<!DOCTYPE html>" + html;

  await write(filePath, htmlWDoc);
}

export async function getChannelsToCreateFilesFor(
  channels: Array<Channel>,
  newMessages: Record<string, number>
) {
  const result: Array<Channel> = [];

  // If HTML regeneration is forced, ignore everything
  // and just return all channels
  if (FORCE_HTML_GENERATION) {
    return await getChannels();
  }

  for (const channel of channels) {
    if (channel.id) {
      // Do we have new messages?
      if (newMessages[channel.id] > 0) {
        result.push(channel);
      }

      // Did we never create a file?
      if (!fs.existsSync(getHTMLFilePath(channel.id!, 0))) {
        result.push(channel);
      }
    }
  }

  return result;
}

async function createHtmlForChannel({
  channel,
  i,
  total,
}: {
  channel: Channel;
  i: number;
  total: number;
}) {
  const messages = await getMessages(channel.id!, true);
  const chunks = chunk(messages, MESSAGE_CHUNK);
  const spinner = ora(
    `Rendering HTML for ${i + 1}/${total} ${channel.name || channel.id}`
  ).start();

  // Calculate info about all chunks
  const chunksInfo: ChunksInfo = [];
  for (const iChunk of chunks) {
    chunksInfo.push({
      oldest: formatTimestamp(iChunk[iChunk.length - 1], "Pp"),
      newest: formatTimestamp(iChunk[0], "Pp"),
      count: iChunk.length,
    });
  }

  if (chunks.length === 0) {
    await renderMessagesPage(
      {
        channel,
        messages: [],
        chunkIndex: 0,
        chunksInfo: chunksInfo,
      },
      spinner
    );
  }

  for (const [chunkI, chunk] of chunks.entries()) {
    await renderMessagesPage(
      {
        channel,
        messages: chunk,
        chunkIndex: chunkI,
        chunksInfo,
      },
      spinner
    );
  }

  spinner.succeed(
    `Rendered HTML for ${i + 1}/${total} ${channel.name || channel.id}`
  );
}

export async function createHtmlForChannels(channels: Array<Channel> = []) {
  console.log(`\n Creating HTML files for ${channels.length} channels...`);

  users = await getUsers();
  slackArchiveData = await getSlackArchiveData();
  me = slackArchiveData.auth?.user_id
    ? users[slackArchiveData.auth?.user_id]
    : null;

  for (const [i, channel] of channels.entries()) {
    if (!channel.id) {
      console.warn(`Can't create HTML for channel: No id found`, channel);
      continue;
    }

    await createHtmlForChannel({ channel, i, total: channels.length });
  }

  await renderIndexPage();

  // Copy in fonts & css
  fs.copySync(path.join(_dirname, "../static"), path.join(OUT_DIR, "html/"));
}

if (esMain(import.meta)) {
  createHtmlForChannels();
}
