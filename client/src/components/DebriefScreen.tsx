import type { FeedbackReport, ScenarioCard, Transcript } from '../contracts';
import { RUBRIC_DIMENSIONS } from '../contracts';
import './DebriefScreen.css';

interface DebriefScreenProps {
	report: FeedbackReport;
	reveal: ScenarioCard['reveal'];
	transcript: Transcript;
	onRestart: () => void;
}

function DebriefScreen({ report, reveal, transcript, onRestart }: DebriefScreenProps) {
	const { decision_outcome: outcome } = report;

	return (
		<div className="debrief-screen">
			<h1>Debrief</h1>

			<section className={`decision-result ${outcome.appropriate ? 'decision-correct' : 'decision-incorrect'}`}>
				<h2>{outcome.appropriate ? 'Appropriate decision' : 'Decision needs review'}</h2>
				<p>
					You chose <strong>{outcome.trainee_decision === 'refer' ? 'Refer' : 'No action'}</strong>. This scenario was{' '}
					<strong>{outcome.ground_truth_type}</strong>.
				</p>
				{outcome.note && <p className="decision-note">Your stated reason: "{outcome.note}"</p>}
			</section>

			<section className="reveal">
				<h2>What was actually going on</h2>
				<p>{reveal.summary}</p>
				{reveal.teaching_points.length > 0 && (
					<ul className="teaching-points">
						{reveal.teaching_points.map((point, i) => (
							<li key={i}>{point}</li>
						))}
					</ul>
				)}
			</section>

			<section className="feedback-summary">
				<h2>Feedback</h2>
				<p>{report.summary}</p>
			</section>

			<section className="dimensions">
				{report.dimensions.map((dim) => {
					const meta = RUBRIC_DIMENSIONS[dim.dimension_id];
					return (
						<div key={dim.dimension_id} className="dimension-card">
							<div className="dimension-header">
								<h3>{meta?.name ?? dim.dimension_id}</h3>
								<span className="dimension-score">{dim.score}/5</span>
							</div>
							<p className="dimension-rationale">{dim.rationale}</p>
							{dim.anchors.length > 0 && (
								<p className="dimension-anchors">
									Referenced turns:{' '}
									{dim.anchors.map((turnId) => {
										const turn = transcript.turns.find((t) => t.turn_id === turnId);
										return turn ? `"${turn.text}"` : turnId;
									}).join('; ')}
								</p>
							)}
						</div>
					);
				})}
			</section>

			<button className="btn btn-primary" onClick={onRestart}>
				Practice another scenario
			</button>
		</div>
	);
}

export default DebriefScreen;
