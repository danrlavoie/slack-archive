import type { Message } from '@slack-archive/types';
import { getFileUrl } from '../api/slack';

interface FilesProps {
  message: Message;
  channelId: string;
}

export const Files = ({ message, channelId }: FilesProps) => {
  const { files } = message;

  if (!files?.length) return null;

  const fileElements = files.map((file) => {
    const { thumb_1024, thumb_720, thumb_480, thumb_pdf } = file;
    const thumb = thumb_1024 || thumb_720 || thumb_480 || thumb_pdf;
    if (!file.id || !file.filetype) {
        // If we can't find a filename or extension, skip rendering
        console.warn(`File ${file.id} is missing id or filetype, skipping rendering.`);
        return;
    }
    let src = getFileUrl(channelId, file.id, file.filetype);
    let href = src;

    if (file.mimetype?.startsWith("image")) {
      return (
        <a key={file.id} href={href} target="_blank" rel="noopener noreferrer">
          <img className="file" src={src} alt={file.name} />
        </a>
      );
    }

    if (file.mimetype?.startsWith("video")) {
      return <video key={file.id} controls src={src} />;
    }

    if (file.mimetype?.startsWith("audio")) {
      return <audio key={file.id} controls src={src} />;
    }

    if (!file.mimetype?.startsWith("image") && thumb) {
      href = file.url_private || href;
      src = src.replace(`.${file.filetype}`, ".png");

      return (
        <a key={file.id} href={href} target="_blank" rel="noopener noreferrer">
          <img className="file" src={src} alt={file.name} />
        </a>
      );
    }

    return (
      <a key={file.id} href={href} target="_blank" rel="noopener noreferrer">
        {file.name}
      </a>
    );
  });

  return <div className="files">{fileElements}</div>;
};