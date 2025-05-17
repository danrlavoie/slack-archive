import React from "react";
import { ChunksInfo } from "../interfaces.js";

interface PaginationProps {
  index: number;
  chunksInfo: ChunksInfo;
  channelId: string;
}
export const Pagination: React.FunctionComponent<PaginationProps> = (props) => {
  const { index, channelId, chunksInfo } = props;
  const length = chunksInfo.length;

  if (length === 1) {
    return null;
  }

  const older =
    index + 1 < length ? (
      <span>
        <a href={`${channelId}-${index + 1}.html`}>Older Messages</a>
      </span>
    ) : null;
  const newer =
    index > 0 ? (
      <span>
        <a href={`${channelId}-${index - 1}.html`}>Newer Messages </a>
      </span>
    ) : null;
  const sep1 = older && newer ? " | " : null;
  const sep2 = older || newer ? " | " : null;

  const options: Array<JSX.Element> = [];
  for (const [i, chunk] of chunksInfo.entries()) {
    const text = `${i} - ${chunk.newest} to ${chunk.oldest}`;
    const value = `${channelId}-${i}.html`;
    const selected = i === index;
    options.push(
      <option selected={selected} key={value} value={value}>
        {text}
      </option>
    );
  }

  return (
    <div className="pagination">
      {newer}
      {sep1}
      {older}
      {sep2}
      <div className="jumper">
        <select id="jumper">{options}</select>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.getElementById("jumper").onchange = function () {
                window.location.href = this.value;
              }
            `,
          }}
        />
      </div>
    </div>
  );
};
