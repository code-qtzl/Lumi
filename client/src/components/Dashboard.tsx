import { useState } from 'react';
import type { InterviewSession } from '../types';
import './Dashboard.css';

interface DashboardProps {
	session: InterviewSession;
	onUpdateNotes: (notes: string) => void;
}

export default function Dashboard({ session, onUpdateNotes }: DashboardProps) {
	const [notes, setNotes] = useState(session.notes);
	const [saved, setSaved] = useState(false);

	const handleSaveNotes = () => {
		onUpdateNotes(notes);
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
	};

	const messageCount = session.messages.length;
	const riskIndicatorCount = session.allIndicators.length;

	return (
		<div className='dashboard'>
			<div className='dashboard-card'>
				<h2>Session Status</h2>
				<div className='status-item'>
					<span className='label'>Officer:</span>
					<span className='value'>{session.officerName}</span>
				</div>
				<div className='status-item'>
					<span className='label'>Messages:</span>
					<span className='value'>{messageCount}</span>
				</div>
				<div className='status-item'>
					<span className='label'>Risk Indicators:</span>
					<span className='value'>{riskIndicatorCount}</span>
				</div>
				<div className='status-item'>
					<span className='label'>Started:</span>
					<span className='value'>
						{new Date(session.createdAt).toLocaleTimeString()}
					</span>
				</div>
			</div>

			<div className='dashboard-card'>
				<h2>Session Notes</h2>
				<textarea
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					placeholder='Add case notes, observations, or follow-up items...'
					className='notes-textarea'
				/>
				<button onClick={handleSaveNotes} className='btn btn-secondary'>
					{saved ? '✓ Saved' : 'Save Notes'}
				</button>
			</div>

			<div className='dashboard-card'>
				<h2>Guidance</h2>
				<div className='guidance-content'>
					<p>
						<strong>Trauma-Informed Approach:</strong>
					</p>
					<ul>
						<li>Listen without judgment</li>
						<li>Avoid accusatory language</li>
						<li>Respect personal space</li>
						<li>Offer breaks as needed</li>
						<li>Escalate urgent concerns immediately</li>
					</ul>
				</div>
			</div>
		</div>
	);
}
