import { NavLink } from "react-router-dom";

const ITEMS = [
  {
    to: "/flow-meter",
    label: "Flow Meter",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    to: "/fuel-consumption-ba",
    label: "Fuel Consumption BA",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18h5a1 1 0 0 0 1-1v-3.34a1 1 0 0 0-.29-.7l-2.42-2.42a1 1 0 0 0-.7-.29H15" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
    ),
  },
  {
    to: "/history",
    label: "History FM",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
  },
  {
    to: "/history-fcba",
    label: "History FCBA",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        <circle cx="7" cy="12" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  // Hidden for now — route still accessible at /indonesia-map
  // {
  //   to: "/indonesia-map",
  //   label: "3D Indonesia Map",
  //   icon: (
  //     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  //       <circle cx="12" cy="12" r="9" />
  //       <path d="M3 12h18" />
  //       <path d="M12 3a14 14 0 0 1 0 18" />
  //       <path d="M12 3a14 14 0 0 0 0 18" />
  //     </svg>
  //   ),
  // },
];

export default function Sidebar() {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1a56db"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        </div>
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-title">Monitoring</div>
          <div className="sidebar-brand-sub">Realtime IoT</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              `sidebar-link${isActive ? " sidebar-link-active" : ""}`
            }
          >
            <span className="sidebar-icon">{it.icon}</span>
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          <span className="sidebar-footer-dot" />
          <span>v0.2 · MQTT bridge</span>
        </div>
      </div>
    </aside>
  );
}
