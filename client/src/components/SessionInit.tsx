import { useState } from 'react';
import './SessionInit.css';

interface SessionInitProps {
  onStart: (officerName: string) => void;
  loading: boolean;
  error: string;
}

export default function SessionInit({ onStart, loading, error }: SessionInitProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onStart(name);
    }
  };

  return (
    <div className="session-init">
      <div className="session-init-container">
        <h1 className="session-title">Beacon Interview Assistant</h1>
        <p className="session-subtitle">Trauma-Informed Risk Scoring Tool</p>

        <div className="session-form-wrapper">
          <form onSubmit={handleSubmit} className="session-form">
            <div className="form-group">
              <label htmlFor="officer-name">Officer Name</label>
              <input
                id="officer-name"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="form-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn btn-primary"
            >
              {loading ? 'Starting...' : 'Start Interview Session'}
            </button>
          </form>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="session-info">
          <h2>How This Works</h2>
          <ul>
            <li>Document officer observations and traveler responses</li>
            <li>AI analyzes responses for risk indicators</li>
            <li>Risk level updates in real-time</li>
            <li>Get guidance on trauma-informed questioning</li>
            <li>Escalation recommendations when needed</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
