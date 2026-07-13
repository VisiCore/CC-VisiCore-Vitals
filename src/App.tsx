import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { Throughput } from './pages/Throughput';
import { Sources } from './pages/Sources';
import { RouteHealthPage } from './pages/RouteHealth';
import { Destinations } from './pages/Destinations';
import { Pipelines } from './pages/Pipelines';
import { Jobs } from './pages/Jobs';
import { Alerts } from './pages/Alerts';
import { Nodes } from './pages/Nodes';
import { Notifications } from './pages/Notifications';
import { DataValue } from './pages/DataValue';

export default function App() {
  return (
    <BrowserRouter basename={window.CRIBL_BASE_PATH}>
      <AppProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="throughput" element={<Throughput />} />
            <Route path="sources" element={<Sources />} />
            <Route path="routes" element={<RouteHealthPage />} />
            <Route path="pipelines" element={<Pipelines />} />
            <Route path="destinations" element={<Destinations />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="nodes" element={<Nodes />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="value" element={<DataValue />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
