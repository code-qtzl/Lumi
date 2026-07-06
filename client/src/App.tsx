import { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import ConversationPanel from './components/ConversationPanel';
import RiskCard from './components/RiskCard';
import SessionInit from './components/SessionInit';
import type { InterviewSession } from './types';

function App() {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const API_BASE = 'http://localhost:3000';

  const handleStartSession = async (officerName: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerName }),
      });

      if (!response.ok) throw new Error('Failed to create session');

      const newSession = await response.json();
      setSession(newSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!session) return;

    try {
      const response = await fetch(
        `${API_BASE}/sessions/${session.id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message }),
        }
      );

      if (!response.ok) throw new Error('Failed to send message');

      const result = await response.json();

      // Update session with new messages and risk data
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.concat([
            result.message,
            result.assistantMessage,
          ]),
          currentRiskLevel: result.sessionUpdated.currentRiskLevel,
          allIndicators: result.sessionUpdated.allIndicators,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleUpdateNotes = async (notes: string) => {
    if (!session) return;

    try {
      const response = await fetch(`${API_BASE}/sessions/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });

      if (!response.ok) throw new Error('Failed to update notes');

      const updated = await response.json();
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notes');
    }
  };

  if (!session) {
    return <SessionInit onStart={handleStartSession} loading={loading} error={error} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Beacon Interview Assistant</h1>
        <p className="subtitle">Trauma-Informed Risk Scoring Tool</p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="app-main">
        <aside className="app-sidebar">
          <Dashboard
            session={session}
            onUpdateNotes={handleUpdateNotes}
          />
        </aside>

        <section className="app-content">
          <ConversationPanel
            messages={session.messages}
            onSendMessage={handleSendMessage}
          />
        </section>

        <aside className="app-risk-panel">
          <RiskCard
            riskLevel={session.currentRiskLevel}
            indicators={session.allIndicators}
            confidence={
              session.messages.find((m) => m.riskAssessment)?.riskAssessment
                ?.confidence || 50
            }
          />
        </aside>
      </main>
    </div>
  );
}

export default App;
