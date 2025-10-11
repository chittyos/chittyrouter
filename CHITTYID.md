# ChittyID Integration

**Status**: ✅ Using official `@chittyos/chittyid-client@1.0.0`

## Usage

```javascript
import { ChittyIDClient } from '@chittyos/chittyid-client';

const client = new ChittyIDClient({
  apiKey: env.CHITTY_ID_TOKEN
});

// Mint ID (SERVICE OR FAIL)
const id = await client.mint({
  entity: 'CONTEXT',
  name: 'my-session',
  metadata: { project: 'chittyrouter' }
});

// Validate
const result = await client.validate(id);
```

## Entity Types

`PEO` | `PLACE` | `PROP` | `EVNT` | `AUTH` | `INFO` | `FACT` | `CONTEXT` | `ACTOR`

## Adapter (for custom entities)

```javascript
import { mintId } from './src/utils/chittyid-adapter.js';

// Automatically maps SESSN → CONTEXT, APIKEY → AUTH
const id = await mintId('SESSN', 'project-sync', env);
```

## Utilities

- **Official Client**: `@chittyos/chittyid-client`
- **Adapter**: `src/utils/chittyid-adapter.js`
- **Deterministic Vectors**: `src/utils/deterministic-vectors.js`
- **Cloudflare Randomness**: `src/utils/cloudflare-randomness.js`

## Environment

```bash
CHITTY_ID_TOKEN=your_token_here
RANDOMNESS_BEACON=true
```

## Compliance

- ✅ SERVICE OR FAIL (no local generation)
- ✅ Deterministic vectors (no Math.random)
- ✅ ChittyCheck compliant
