import 'dotenv/config';
import app from './app';
import { listScenarios } from './scenarios/registry';
import { assertIdentityConfig } from './identity';
import { assertTravelerConfig } from './traveler';

assertIdentityConfig();
assertTravelerConfig();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`[server] Session runtime running on http://localhost:${PORT}`);
  console.log(`[server] Scenarios: ${listScenarios().length} loaded`);
});

