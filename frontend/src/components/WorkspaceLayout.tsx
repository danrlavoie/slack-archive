import { Outlet } from 'react-router-dom';
import { ChannelSidebar } from './ChannelSidebar';

export const WorkspaceLayout = () => {
  return (
    <>
      <ChannelSidebar />
      <Outlet />
    </>
  );
};
