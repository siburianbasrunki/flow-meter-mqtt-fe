import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import FlowMeterPage from "./pages/FlowMeterPage";
import Fs02Page from "./pages/Fs02Page";
import FuelConsumptionBaPage from "./pages/FuelConsumptionBaPage";
import HistoryAggregatedPage from "./pages/HistoryAggregatedPage";
import HistoryFcbaPage from "./pages/HistoryFcbaPage";
import HistoryFs02Page from "./pages/HistoryFs02Page";
import HistoryPage from "./pages/HistoryPage";
import IndonesiaMapPage from "./pages/IndonesiaMapPage";
import "./dashboard.css";
import "./app-shell.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/flow-meter" replace />} />
          <Route path="/flow-meter" element={<FlowMeterPage />} />
          <Route
            path="/fuel-consumption-ba"
            element={<FuelConsumptionBaPage />}
          />
          <Route path="/history" element={<HistoryPage />} />
          <Route
            path="/history-aggregated"
            element={<HistoryAggregatedPage />}
          />
          <Route path="/history-fcba" element={<HistoryFcbaPage />} />
          <Route path="/fs02" element={<Fs02Page />} />
          <Route path="/history-fs02" element={<HistoryFs02Page />} />
          <Route path="/indonesia-map" element={<IndonesiaMapPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
