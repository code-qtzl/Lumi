# Beacon App — Server

Express.js API server for Beacon App.

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm

### Installation

```bash
npm install
```

### Running the Server

```bash
npm run server
```

The server will be available at `http://localhost:3000`

## API Endpoints

- `GET /messages` - Retrieve all messages
- `POST /messages` - Create a new message
  - Body: `{ "name": "string", "message": "string" }`

## Client Connection

This backend serves a React client application. For client setup instructions, see the [Client README](../client/README.md).
