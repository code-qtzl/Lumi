import type { RiskLevel, RiskIndicator } from '../types';
import './RiskCard.css';

interface RiskCardProps {
	riskLevel: RiskLevel;
	indicators: RiskIndicator[];
	confidence: number;
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
	indicators,
	confidence,
}: RiskCardProps) {
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
					<span className='risk-badge'>
						{riskLevel.toUpperCase()}
					</span>
					<span className='confidence'>{confidence}% Confidence</span>
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
		</div>
	);
}
