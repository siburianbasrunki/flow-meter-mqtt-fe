import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import FlowMeterPage from "./pages/FlowMeterPage";
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
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/indonesia-map" element={<IndonesiaMapPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
