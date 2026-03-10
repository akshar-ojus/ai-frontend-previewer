import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { previews } from './dashboard.data';
import './dashboard.css'; // Import the new styles
import logo from './logo.svg';

const Dashboard = () => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(previews.length > 0 ? previews[0] : null);

  const filtered = previews.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dashboard-container">
      {/* LEFT SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src={logo} alt="AI Frontend Previewer" className="brand-logo" />
          <h1 className="brand-name">AI Frontend Previewer</h1>
          <p className="subtitle">
            {previews.length} component{previews.length !== 1 ? 's' : ''} changed
          </p>
          <input
            type="text"
            className="search-box"
            placeholder="🔍  Search components..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="list-label">Components</div>
        <ul className="component-list">
          {filtered.map((item) => (
            <li
              key={item.name}
              className={`nav-item ${selected?.name === item.name ? 'active' : ''}`}
              onClick={() => setSelected(item)}
            >
              <div className="nav-icon">{item.name.slice(0, 2)}</div>
              <div className="nav-text">
                <span className="component-name">{item.name}</span>
                <span className="component-path">{item.originalPath}</span>
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              No components found
            </li>
          )}
        </ul>
      </aside>

      {/* RIGHT STAGE */}
      <main className="stage">
        <div className="stage-topbar">
          <span className="stage-title">
            {selected ? selected.name : 'Preview'}
          </span>
          {selected && <span className="stage-badge">Live Preview</span>}
        </div>

        {selected ? (
          <div className="frame-wrapper">
            <div className="browser-chrome">
              <div className="browser-dots">
                <span className="browser-dot dot-red" />
                <span className="browser-dot dot-yellow" />
                <span className="browser-dot dot-green" />
              </div>
              <div className="browser-url">{selected.url}</div>
            </div>
            <iframe
              src={selected.url}
              title={selected.name}
              className="preview-frame"
            />
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">⚡</div>
            <span>Select a component to preview</span>
          </div>
        )}
      </main>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<Dashboard />);