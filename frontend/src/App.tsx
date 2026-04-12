import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { ChannelView } from './components/ChannelView';
import { ThreadView } from './components/ThreadView';
import './styles/main.scss';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div id="index">
          <Routes>
            <Route path="/" element={<Navigate to="/ws/default/" replace />} />
            <Route path="/ws/:workspaceId" element={<WorkspaceLayout />}>
              <Route path="c/:channelId" element={<ChannelView />} />
              <Route path="c/:channelId/t/:threadTs" element={<ThreadView />} />
              {/* Search route added in next stage */}
            </Route>
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
