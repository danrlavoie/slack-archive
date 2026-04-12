import { useMemo } from 'react';
import slackMarkdown from 'slack-markdown';
import parse, { domToReact } from 'html-react-parser';
import type { Users } from '@slack-archive/types';
import { getName } from '../utils/users';

interface SlackTextProps {
  text: string;
  users: Users;
}

/**
 * SlackText component to render formatted Slack message text.
 * It converts Slack markdown to HTML and handles user mentions and blockquotes.
 * @param {string} text - The Slack message text to be formatted.
 * @param {Users} users - An object containing user profiles keyed by user ID.
 * @returns {JSX.Element} - Returns a JSX element containing the formatted text.
 * @example
 * <SlackText text="Hello @U12345678, check this out!" users={users} />
 */
export const SlackText = ({ text, users }: SlackTextProps) => {
  const slackCallbacks = {
    user: ({ id }: { id: string }) => `@${getName(id, users)}`,
  };

  const html = useMemo(() => {
    const formatted = slackMarkdown.toHTML(text, {
      escapeHTML: true,
      slackCallbacks
    });
    
    return parse(formatted, {
      replace: (domNode: any) => {
        if (domNode.type === 'tag' && domNode.name === 'a') {
          return (
            <a 
              href={domNode.attribs.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {domToReact(domNode.children)}
            </a>
          );
        }
        if (domNode.type === 'text') {
          const textContent = domNode.data;
          
          if (textContent.startsWith('&gt; ')) {
            return (
              <blockquote>
                {domToReact([{
                  ...domNode,
                  data: textContent.replace('&gt; ', '')
                }])}
              </blockquote>
            );
          }
          
          return domToReact([domNode]);
        }
      }
    });
  }, [text, users]);

  return <div className="text">{html}</div>;
};