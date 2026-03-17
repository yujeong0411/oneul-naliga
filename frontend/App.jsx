import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ChartDetail from "./pages/ChartDetail";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chart/:code" element={<ChartDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
