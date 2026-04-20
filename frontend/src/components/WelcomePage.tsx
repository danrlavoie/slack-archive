export const WelcomePage = () => {
  return (
    <div id="messages">
      <div className="welcome">
        <div className="welcome-brand">
          <img src="/slack.svg" alt="Slack logo" className="welcome-logo" />
          <span className="welcome-title">Old Slack</span>
        </div>
        <p className="welcome-hint">Pick a channel from the sidebar to start reading.</p>
      </div>
    </div>
  );
};
