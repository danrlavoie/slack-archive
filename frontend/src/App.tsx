import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChannelView } from './components/ChannelView';
import './styles/main.scss';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div id="index">
          <Routes>
            <Route path="/" element={<ChannelSidebar />}>
              <Route path="/channels/:channelId" element={<ChannelView />} />
            </Route>
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
