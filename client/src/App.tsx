import { useState, useEffect } from 'react';
import './App.css';

interface Message {
	id: number;
	name: string;
	message: string;
	timestamp: string;
}

function App() {
	const [messages, setMessages] = useState<Message[]>([]); // State to hold messages
	const [name, setName] = useState(''); // State for the name input
	const [message, setMessage] = useState(''); // State for the message input

	useEffect(() => {
		fetchMessages(); // Fetch messages when the component mounts
	}, []);

	const fetchMessages = async () => {
		try {
			const response = await fetch('http://localhost:3000/messages');
			const data = await response.json();
			setMessages(data);
		} catch (error) {
			console.error('Error fetching messages:', error);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault(); // Prevent form submission from reloading the page
		if (!name.trim() || !message.trim()) return;

		try {
			const response = await fetch('http://localhost:3000/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, message }),
			});

			if (response.ok) {
				setName('');
				setMessage('');
				fetchMessages();
			}
		} catch (error) {
			console.error('Error posting message:', error);
		}
	};

	return (
		<div className='App'>
			<h1>Beacon App</h1>
			<div className='messages'>
				{messages.length === 0 ? (
					<p className='no-messages'>No messages yet.</p>
				) : (
					messages
						.slice()
						.reverse()
						.map((msg) => (
							<div key={msg.id} className='message'>
								<strong>{msg.name}</strong>
								<p>{msg.message}</p>
								<small>
									{new Date(msg.timestamp).toLocaleString()}
								</small>
							</div>
						))
				)}
			</div>

			<div className='post-section'>
				<h2>Post a Message</h2>
				<form onSubmit={handleSubmit}>
					<input
						type='text'
						placeholder='Your name'
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<textarea
						placeholder='Your message'
						value={message}
						onChange={(e) => setMessage(e.target.value)}
					/>
					<button type='submit'>Post Message</button>
				</form>
			</div>
		</div>
	);
}

export default App;
