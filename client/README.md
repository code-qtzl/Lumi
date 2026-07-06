# Beacon App — Client

React + TypeScript + Vite frontend for Beacon App.

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Running the App

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Environment Variables

Copy `client/.env.example` to `client/.env` and adjust the API URL if needed.

- `VITE_API_BASE_URL` defaults to `http://localhost:3000`

### Running the Linter

```bash
npm run lint
```

## Server Connection

This frontend connects to a server running on `http://localhost:3000`. Make sure the server is running before using the app.

For server setup instructions, see the [server README](../server/README.md).
