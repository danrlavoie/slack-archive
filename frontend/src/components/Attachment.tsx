interface AttachmentProps {
  service_icon?: string;
  service_name?: string;
  title?: string;
  title_link?: string;
  image_url?: string;
  thumb_url?: string;
  text?: string;
}

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