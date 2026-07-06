import { useState, useEffect, useRef } from 'react';
import type { InterviewMessage } from '../types';
import './ConversationPanel.css';

interface ConversationPanelProps {
	messages: InterviewMessage[];
	onSendMessage: (message: string) => void;
}

export default function ConversationPanel({
	messages,
	onSendMessage,
}: ConversationPanelProps) {
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim()) return;

		setLoading(true);
		const content = input;
		setInput('');

		try {
			await onSendMessage(content);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='conversation-panel'>
			<div className='messages-container'>
				{messages.length === 0 ? (
					<div className='no-messages'>
						<p>
							Start the interview by entering your initial
							observations.
						</p>
					</div>
				) : (
					messages.map((msg) => (
						<div
							key={msg.id}
							className={`message message-${msg.role}`}
						>
							<div className='message-header'>
								<span className='role-badge'>
									{msg.role === 'officer'
										? '👮 Officer'
										: '🤖 Assistant'}
								</span>
								<span className='timestamp'>
									{new Date(
										msg.timestamp,
									).toLocaleTimeString()}
								</span>
							</div>
							<div className='message-content'>{msg.content}</div>
							{msg.riskAssessment && (
								<div
									className={`risk-badge risk-${msg.riskAssessment.level}`}
								>
									Risk:{' '}
									{msg.riskAssessment.level.toUpperCase()} (
									{msg.riskAssessment.confidence}% confidence)
								</div>
							)}
						</div>
					))
				)}
				<div ref={messagesEndRef} />
			</div>

			<form onSubmit={handleSubmit} className='input-form'>
				<textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder='Enter officer observations or traveler responses...'
					disabled={loading}
					className='message-input'
					rows={3}
				/>
				<button
					type='submit'
					disabled={loading || !input.trim()}
					className='btn btn-primary'
				>
					{loading ? 'Analyzing...' : 'Send'}
				</button>
			</form>
		</div>
	);
}
