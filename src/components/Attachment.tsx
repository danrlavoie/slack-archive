import React from "react";
interface AttachmentProps {
  service_icon?: string;
  service_name?: string;
  title?: string;
  title_link?: string;
  image_url?: string;
  thumb_url?: string;
  text?: string;
}
export const Attachment: React.FunctionComponent<AttachmentProps> = (props) => {
  const {
    service_icon,
    service_name,
    title,
    title_link,
    image_url,
    thumb_url,
    text,
  } = props;

  let imageContent;
  if (!!image_url) {
    imageContent = <img className="attachment-image" src={image_url} />;
  } else if (!!thumb_url) {
    imageContent = <img className="attachment-image" src={thumb_url} />;
  }

  return (
    <div className="attachment-gutter">
      <div className="attachment-service">
        <img className="attachment-service-icon" src={service_icon} />
        <span className="attachment-service-name">
          <strong>{service_name}</strong>
        </span>
      </div>
      <div>
        <a href={title_link} target="_blank">
          {title}
        </a>
      </div>
      <div className="text">{text}</div>
      {imageContent}
    </div>
  );
};
