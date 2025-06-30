import fs from "fs";
import path from "path";
import { CHANNELS_DATA_PATH } from "./config";

/**
 * Recursively extract all text content from a Slack message's blocks.
 * Handles Slack's block kit structure.
 */
function extractTextFromBlocks(blocks: any[]): string[] {
  if (!Array.isArray(blocks)) return [];
  const texts: string[] = [];

  function walk(element: any) {
    if (!element) return;
    if (typeof element === "string") {
      texts.push(element);
    } else if (Array.isArray(element)) {
      element.forEach(walk);
    } else if (typeof element === "object") {
      // Slack blocks may have a "text" property, or "elements" (for rich_text)
      if (element.text && typeof element.text === "string") {
        texts.push(element.text);
      }
      if (element.elements) {
        walk(element.elements);
      }
      // Some blocks have "fields" (array of text)
      if (element.fields) {
        walk(element.fields);
      }
      // Some blocks have "title" or "alt_text"
      if (element.title && typeof element.title === "string") {
        texts.push(element.title);
      }
      if (element.alt_text && typeof element.alt_text === "string") {
        texts.push(element.alt_text);
      }
      // Some blocks have "fallback"
      if (element.fallback && typeof element.fallback === "string") {
        texts.push(element.fallback);
      }
      // Some blocks have "plain_text"
      if (element.plain_text && typeof element.plain_text === "string") {
        texts.push(element.plain_text);
      }
      // Some blocks have "label"
      if (element.label && typeof element.label === "string") {
        texts.push(element.label);
      }
      // Some blocks have "title_link"
      if (element.title_link && typeof element.title_link === "string") {
        texts.push(element.title_link);
      }
      // Some blocks have "service_name"
      if (element.service_name && typeof element.service_name === "string") {
        texts.push(element.service_name);
      }
      // Some blocks have "service_icon"
      if (element.service_icon && typeof element.service_icon === "string") {
        texts.push(element.service_icon);
      }
      // Some blocks have "original_url"
      if (element.original_url && typeof element.original_url === "string") {
        texts.push(element.original_url);
      }
      // Some blocks have "from_url"
      if (element.from_url && typeof element.from_url === "string") {
        texts.push(element.from_url);
      }
      // Some blocks have "url"
      if (element.url && typeof element.url === "string") {
        texts.push(element.url);
      }
      // Some blocks have "title" as an object (with "text")
      if (
        element.title &&
        typeof element.title === "object" &&
        element.title.text
      ) {
        texts.push(element.title.text);
      }
    }
  }

  blocks.forEach(walk);
  return texts;
}

/**
 * Extract all text content from a Slack message's attachments.
 * Handles Slack's attachment structure.
 */
function extractTextFromAttachments(attachments: any[]): string[] {
  if (!Array.isArray(attachments)) return [];
  const texts: string[] = [];
  for (const att of attachments) {
    if (att.text && typeof att.text === "string") {
      texts.push(att.text);
    }
    if (att.title && typeof att.title === "string") {
      texts.push(att.title);
    }
    if (att.fallback && typeof att.fallback === "string") {
      texts.push(att.fallback);
    }
    if (att.pretext && typeof att.pretext === "string") {
      texts.push(att.pretext);
    }
    if (att.fields && Array.isArray(att.fields)) {
      for (const field of att.fields) {
        if (field.title) texts.push(field.title);
        if (field.value) texts.push(field.value);
      }
    }
    // Some attachments may have blocks
    if (att.blocks) {
      texts.push(...extractTextFromBlocks(att.blocks));
    }
  }
  return texts;
}

/**
 * Given a message object, extract all searchable text from it.
 */
function extractSearchableText(msg: any): string {
  const texts: string[] = [];
  if (msg.text && typeof msg.text === "string") {
    texts.push(msg.text);
  }
  if (msg.blocks) {
    texts.push(...extractTextFromBlocks(msg.blocks));
  }
  if (msg.attachments) {
    texts.push(...extractTextFromAttachments(msg.attachments));
  }
  // Some messages may have "files" with "title" or "name"
  if (msg.files && Array.isArray(msg.files)) {
    for (const file of msg.files) {
      if (file.title) texts.push(file.title);
      if (file.name) texts.push(file.name);
    }
  }
  // Some messages may have "subtype" (e.g. "bot_message") with "username"
  if (msg.username) {
    texts.push(msg.username);
  }
  // Remove undefined/null, join with space, collapse whitespace
  return texts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Get a list of message JSON files by channel ID.
 * Prefer using channels.json if available, otherwise fall back to regex.
 */
function getMessageJsonFiles(dataDir: string): string[] {
  const files: string[] = [];
  let channelIds: string[] = [];

  // Try to use channels.json if it exists
  if (fs.existsSync(CHANNELS_DATA_PATH)) {
    try {
      const channels = JSON.parse(fs.readFileSync(CHANNELS_DATA_PATH, "utf8"));
      if (Array.isArray(channels)) {
        channelIds = channels
          .map((c) => c.id)
          .filter((id) => typeof id === "string" && id.length > 0);
      }
    } catch (e) {
      // If channels.json is malformed, fallback to regex
      channelIds = [];
    }
  }

  // Only include files named after channel IDs
  for (const id of channelIds) {
    const filePath = path.join(dataDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

/**
 * Main function to create a search index from Slack message JSON files.
 * @param {string} dataDir - Directory containing Slack message JSON files.
 * @param {string} outFile - Path to write the search index JSON.
 */
export async function createSearchIndex(
  dataDir: string,
  outFile: string
): Promise<void> {
  const files = getMessageJsonFiles(dataDir);
  const index: Record<string, { text: string; file: string; ts?: string }> = {};

  for (const file of files) {
    let messages: any[];
    try {
      const raw = fs.readFileSync(file, "utf8");
      messages = JSON.parse(raw);
      if (!Array.isArray(messages)) continue;
    } catch (e) {
      // Not a message file, skip
      continue;
    }
    for (const msg of messages) {
      // Use ts as unique ID, fallback to client_msg_id if present
      const id = msg.ts || msg.client_msg_id;
      if (!id) continue;
      const text = extractSearchableText(msg);
      if (!text) continue;
      index[id] = {
        text,
        file: path.relative(dataDir, file),
        ts: msg.ts,
      };
    }
  }

  // Write the index to disk
  fs.writeFileSync(outFile, JSON.stringify(index, null, 2), "utf8");
}

// Example usage (uncomment to run directly):
// createSearchIndex(
//   "/home/danlavoie/git/slack-archive/slack-archive/data",
//   "/home/danlavoie/git/slack-archive/slack-archive/search-index.json"
// ).then(() => console.log("Search index created."));
