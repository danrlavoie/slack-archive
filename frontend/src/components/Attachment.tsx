interface AttachmentProps {
  service_icon?: string;
  service_name?: string;
  title?: string;
  title_link?: string;
  image_url?: string;
  thumb_url?: string;
  text?: string;
}

/**
 * Attachment component to display rich content in a message.
 * @param {string} service_icon - URL of the service icon.
 * @param {string} service_name - Name of the service.
 * @param {string} title - Title of the attachment.
 * @param {string} title_link - URL for the title link.
 * @param {string} image_url - URL of the main image.
 * @param {string} thumb_url - URL of the thumbnail image.
 * @param {string} text - Text content of the attachment.
 * @returns {JSX.Element} Rendered attachment component.
 * @example
 * <Attachment
 *   service_icon="https://example.com/icon.png"
 *   service_name="Example Service"
 *   title="Example Attachment"
 *   title_link="https://example.com"
 *   image_url="https://example.com/image.png"
 *   thumb_url="https://example.com/thumb.png"
 *   text="This is an example attachment."
 * />
 */
export const Attachment = ({
  service_icon,
  service_name,
  title,
  title_link,
  image_url,
  thumb_url,
  text,
}: AttachmentProps) => {
  const imageContent = image_url ? (
    <img className="attachment-image" src={image_url} alt={title} />
  ) : thumb_url ? (
    <img className="attachment-image" src={thumb_url} alt={title} />
  ) : null;

  return (
    <div className="attachment-gutter">
      {(service_icon || service_name) && (
        <div className="attachment-service">
          {service_icon && (
            <img 
              className="attachment-service-icon" 
              src={service_icon} 
              alt={service_name}
            />
          )}
          {service_name && (
            <span className="attachment-service-name">
              <strong>{service_name}</strong>
            </span>
          )}
        </div>
      )}
      {title && (
        <div>
          {title_link ? (
            <a href={title_link} target="_blank" rel="noopener noreferrer">
              {title}
            </a>
          ) : (
            title
          )}
        </div>
      )}
      {text && <div className="text">{text}</div>}
      {imageContent}
    </div>
  );
};