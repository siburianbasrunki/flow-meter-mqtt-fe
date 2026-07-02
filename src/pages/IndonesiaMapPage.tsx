import IndonesiaMap3D from "../components/IndonesiaMap3D";

export default function IndonesiaMapPage() {
  return (
    <div className="indonesia-map-page">
      <header className="indonesia-map-header">
        <div>
          <h1>3D Indonesia Map</h1>
          <p>Realistic topography rendered with Three.js · SRTM-derived heightmap</p>
        </div>
      </header>
      <div className="indonesia-map-stage">
        <IndonesiaMap3D />
      </div>
    </div>
  );
}
