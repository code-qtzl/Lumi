import express from 'express';
import cors from 'cors';

interface Message {
	id: number;
	name: string;
	message: string;
	timestamp: Date;
}

const app = express(); // Runs the Express server
const PORT = 3000; // Port number for the server

app.use(cors()); // Enable CORS for all origins (useful for frontend-backend communication)
app.use(express.json());

let messages: Message[] = []; // In-memory storage for messages
let nextId = 1; // To generate unique IDs for messages

app.get('/messages', (req, res) => {
	// API endpoint to get all messages
	res.json(messages);
});

app.post('/messages', (req, res) => {
	const { name, message } = req.body; // Destructure name and message from request body

	if (!name || !message) {
		return res.status(400).json({ error: 'Name and message are required' });
	}

	const newMessage: Message = {
		id: nextId++,
		name,
		message,
		timestamp: new Date(),
	};

	messages.push(newMessage); // Add the new message to the in-memory array
	res.status(201).json(newMessage); // Respond with the created message
});

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
