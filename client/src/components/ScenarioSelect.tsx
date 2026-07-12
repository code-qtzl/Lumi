import { useEffect, useState } from 'react';
import type { ScenarioSummary } from '../contracts';
import { listScenarios } from '../api';
import './ScenarioSelect.css';

interface ScenarioSelectProps {
	onSelect: (scenarioId: string) => void;
	starting: boolean;
}

function ScenarioSelect({ onSelect, starting }: ScenarioSelectProps) {
	const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		listScenarios()
			.then((res) => setScenarios(res.scenarios))
			.catch((err) => setError(err instanceof Error ? err.message : 'Failed to load scenarios'))
			.finally(() => setLoading(false));
	}, []);

	return (
		<div className="scenario-select">
			<h1>Lumi Training Simulator</h1>
			<p className="scenario-select-subtitle">
				Practice trauma-informed interviewing against an AI-role-played traveler. Choose a scenario to begin.
			</p>

			{loading && <p>Loading scenarios…</p>}
			{error && <div className="error-banner">{error}</div>}

			<ul className="scenario-list">
				{scenarios.map((scenario) => (
					<li key={scenario.scenario_id} className="scenario-card">
						<h2>{scenario.title}</h2>
						<button
							className="btn btn-primary"
							disabled={starting}
							onClick={() => onSelect(scenario.scenario_id)}
						>
							{starting ? 'Starting…' : 'Start session'}
						</button>
					</li>
				))}
			</ul>

			{!loading && !error && scenarios.length === 0 && <p>No scenarios available.</p>}
		</div>
	);
}

export default ScenarioSelect;
