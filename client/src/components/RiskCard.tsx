import type {
	DisplayRiskLevel,
	RiskLevel,
	RiskIndicator,
	RiskOverrideAuditEntry,
	ToneState,
} from '../types';
import './RiskCard.css';

interface RiskCardProps {
	riskLevel: RiskLevel;
	displayRiskLevel?: DisplayRiskLevel;
	indicators: RiskIndicator[];
	confidence: number;
	toneState: ToneState;
	riskOverrideAudit: RiskOverrideAuditEntry[];
}

const CATEGORY_LABELS: Record<string, string> = {
	travel_control: '✈️ Travel Control',
	document_control: '📄 Document Control',
	coercion: '⚠️ Coercion',
	inconsistency: '❓ Inconsistency',
	vulnerable_person: '🛡️ Vulnerable Person',
	urgent_safety: '🚨 Urgent Safety',
};

export default function RiskCard({
	riskLevel,
	displayRiskLevel,
	indicators,
	confidence,
	toneState,
	riskOverrideAudit,
}: RiskCardProps) {
	const displayLabel = (displayRiskLevel || riskLevel).toUpperCase();
	const indicatorsByCategory = indicators.reduce(
		(acc, indicator) => {
			if (!acc[indicator.category]) {
				acc[indicator.category] = [];
			}
			acc[indicator.category].push(indicator);
			return acc;
		},
		{} as Record<string, RiskIndicator[]>,
	);

	return (
		<div className='risk-card'>
			<div className={`risk-level-display risk-level-${riskLevel}`}>
				<h2>Risk Level</h2>
				<div className='risk-status'>
					<span className='risk-badge'>{displayLabel}</span>
					<span className='confidence'>{confidence}% Confidence</span>
				</div>
				<p className='risk-caption'>
					Internal model state: {riskLevel}
				</p>
			</div>

			<div className='tone-state-section'>
				<h3>Tone State</h3>
				<div className='tone-state-grid'>
					<div>
						<span className='tone-state-label'>Baseline</span>
						<strong>
							{toneState.baseline
								? `Captured (${toneState.baseline.reasonTag})`
								: 'Pending'}
						</strong>
					</div>
					<div>
						<span className='tone-state-label'>Tone Concern</span>
						<strong>
							{toneState.toneRaisedConcernActive
								? 'Active'
								: 'Inactive'}
						</strong>
					</div>
					<div>
						<span className='tone-state-label'>Decay Counter</span>
						<strong>
							{toneState.consecutiveNormalTravelerUtterances}/3
							normal traveler utterances
						</strong>
					</div>
				</div>
			</div>

			<div className='indicators-section'>
				<h3>Risk Indicators</h3>
				{indicators.length === 0 ? (
					<p className='no-indicators'>
						No risk indicators detected yet.
					</p>
				) : (
					<div className='indicators-list'>
						{Object.entries(indicatorsByCategory).map(
							([category, cats]) => (
								<div
									key={category}
									className='indicator-category'
								>
									<h4>
										{CATEGORY_LABELS[category] || category}
									</h4>
									<ul>
										{cats.map((indicator, idx) => (
											<li
												key={idx}
												className={`severity-${indicator.severity}`}
											>
												<span className='description'>
													{indicator.description}
												</span>
												<small className='evidence'>
													Evidence:{' '}
													{indicator.evidence}
												</small>
											</li>
										))}
									</ul>
								</div>
							),
						)}
					</div>
				)}
			</div>

			<div className='recommendations-section'>
				<h3>Quick Reference</h3>
				<div className='risk-info'>
					{riskLevel === 'unsafe' && (
						<div className='alert-box alert-urgent'>
							<strong>🚨 Immediate Escalation Needed</strong>
							<p>
								Multiple critical indicators detected. Contact
								supervisory officer immediately. Ensure traveler
								safety is prioritized.
							</p>
						</div>
					)}
					{riskLevel === 'risky' && (
						<div className='alert-box alert-warning'>
							<strong>⚠️ Moderate Risk Detected</strong>
							<p>
								Continue probing identified categories. Document
								all observations carefully. Consult with
								supervisor if needed.
							</p>
						</div>
					)}
					{riskLevel === 'safe' && (
						<div className='alert-box alert-safe'>
							<strong>✓ No Significant Concerns</strong>
							<p>
								Continue routine assessment. Monitor for any
								changes in situation or responses.
							</p>
						</div>
					)}
				</div>
			</div>

			<div className='audit-section'>
				<h3>Override Audit</h3>
				{riskOverrideAudit.length === 0 ? (
					<p className='no-indicators'>No overrides recorded.</p>
				) : (
					<div className='audit-list'>
						{riskOverrideAudit
							.slice(-3)
							.reverse()
							.map((entry) => (
								<div key={entry.id} className='audit-item'>
									<strong>
										{entry.previousLevel} to{' '}
										{entry.nextLevel}
									</strong>
									<p>{entry.justification}</p>
									<small>
										{entry.createdBy} ·{' '}
										{new Date(
											entry.createdAt,
										).toLocaleString()}
										{entry.supervisorAcknowledged
											? ' · Supervisor acknowledged'
											: ''}
									</small>
								</div>
							))}
					</div>
				)}
			</div>
		</div>
	);
}
