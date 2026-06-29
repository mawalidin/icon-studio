import React from "react";
import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import Library from "./workspaces/Library/index.jsx";
import Generate from "./workspaces/Generate/index.jsx";
import Animate from "./workspaces/Animate/index.jsx";
import Import from "./workspaces/Import/index.jsx";

const NAV = [
  {
    path: "/library",
    label: "Library",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    path: "/generate",
    label: "Generate",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18M3 12h18" />
      </svg>
    ),
  },
  {
    path: "/animate",
    label: "Animate",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m10 8 6 4-6 4V8Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    path: "/import",
    label: "Import",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
];

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-stone-50 text-stone-900 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex-none flex items-center justify-between border-b border-stone-200 bg-white px-5 py-0 h-12">
        {/* Wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-stone-900 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 3 9v12h6v-6h6v6h6V9L12 3Z" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-stone-900">Icon Studio</span>
          <span className="text-xs text-stone-400 ml-0.5">· Multi-brand icon library</span>
        </div>

        {/* Workspace tabs */}
        <nav className="flex items-center gap-1">
          {NAV.map(({ path, label, icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                "flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition " +
                (isActive
                  ? "bg-stone-900 text-white"
                  : "text-stone-500 hover:text-stone-800 hover:bg-stone-100")
              }
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right slot — reserved for future user/settings */}
        <div className="w-24" />
      </header>

      {/* ── Workspace area ── */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<Library />} />
          <Route path="/generate" element={<Generate />} />
          <Route path="/animate" element={<Animate />} />
          <Route path="/animate/:iconId" element={<Animate />} />
          <Route path="/import" element={<Import />} />
        </Routes>
      </main>
    </div>
  );
}
