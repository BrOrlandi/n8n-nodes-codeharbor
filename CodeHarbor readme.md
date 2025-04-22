# CodeHarbor-Executor

A Node.js service that provides secure code execution for JavaScript functions with dependency management and caching.

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/CodeHarbor-Executor.git

# Navigate to the project directory
cd CodeHarbor-Executor

# Install dependencies
npm install

# Create a .env file (optional)
cp .env.example .env

# Start the server
npm start
```

## Configuration

The service uses dotenv for environment configuration. Create a `.env` file in the root directory with the following variables:

```
PORT=3000
EXECUTION_DIR=./executions
CACHE_DIR=./dependencies-cache
SECRET_KEY=your-secret-key-here
DEFAULT_TIMEOUT=60000
CACHE_SIZE_LIMIT=1GB
```

The following environment variables can be used to configure the service:

- `PORT`: The port on which the service will run (default: 3000)
- `EXECUTION_DIR`: Directory for temporary code execution files (default: './executions')
- `CACHE_DIR`: Directory for cached dependencies (default: './dependencies-cache')
- `SECRET_KEY`: Authentication token for API calls (default: none)
- `DEFAULT_TIMEOUT`: Default execution timeout in milliseconds (default: 60000)
- `CACHE_SIZE_LIMIT`: Maximum cache directory size with support for human-readable values like "500MB", "1GB", etc. (default: "1GB")

## API

### Execute Code

**Endpoint:** `POST /execute`

**Authentication:**

```
Authorization: Bearer YOUR_SECRET_KEY
```

(Required only if SECRET_KEY is configured)

**Request Body:**

```json
{
	"code": "module.exports = function(items) { return items.map(item => item * 2); }",
	"items": [1, 2, 3, 4, 5],
	"options": {
		"timeout": 30000,
		"forceUpdate": false,
		"debug": true
	}
}
```

**Parameters:**

- `code` (required): JavaScript code that exports a function
- `items`: Input data to pass to the function (default: [])
- `cacheKey` (optional): Unique identifier for dependency caching. If not provided, CodeHarbor will use a global cache internally.
- `options`:
  - `timeout`: Custom execution timeout in milliseconds
  - `forceUpdate`: Force fresh installation of dependencies
  - `debug`: When set to true, returns detailed debug information about the execution

**Response:**

```json
{
	"success": true,
	"data": [2, 4, 6, 8, 10],
	"debug": {
		"nodeVersion": "v16.14.0",
		"platform": "linux",
		"arch": "x64",
		"dependencies": {
			"lodash": "4.17.21"
		},
		"executionTimeMs": 12.34,
		"server": {
			"nodeVersion": "v16.14.0",
			"platform": "linux",
			"architecture": "x64",
			"totalMemory": "8192 MB",
			"freeMemory": "4096 MB",
			"cpus": 8,
			"uptime": "120 minutes"
		},
		"cache": {
			"usedCache": true,
			"cacheKey": "workflow-123-node-456",
			"cachePath": "/app/cache/workflow-123-node-456",
			"currentCacheSize": 5242880,
			"currentCacheSizeFormatted": "5 MB",
			"totalCacheSize": 52428800,
			"totalCacheSizeFormatted": "50 MB"
		},
		"execution": {
			"startTime": "2023-06-25T14:30:45.123Z",
			"dependencies": {
				"lodash": "4.17.21"
			},
			"extractedDependencies": {
				"lodash": "latest"
			},
			"dependencyInstallTimeMs": 345.67,
			"executionTimeMs": 12.34,
			"totalResponseTimeMs": 358.01
		}
	}
}
```

### Example curl Request

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-key-here" \
  -d '{
    "code": "module.exports = function(items) { return items.map(item => item * 2); }",
    "items": [1, 2, 3, 4, 5],
    "options": {
      "debug": true
    }
  }'
```

### Example with Dependencies and Custom Cache Key

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-key-here" \
  -d '{
    "code": "const _ = require('\''lodash'\''); module.exports = function(items) { return _.map(items, item => item * 2); }",
    "items": [1, 2, 3, 4, 5],
    "cacheKey": "workflow-123-node-456"
  }'
```

### Example with Global Cache (No Cache Key)

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-key-here" \
  -d '{
    "code": "const _ = require('\''lodash'\''); module.exports = function(items) { return _.map(items, item => item * 2); }",
    "items": [1, 2, 3, 4, 5]
  }'
```

## Health Check

**Endpoint:** `GET /health`

**Response:**

```json
{
	"status": "ok",
	"version": "1.0.0",
	"auth": "enabled",
	"defaultTimeout": "60000ms"
}
```

## Authentication Verification

**Endpoint:** `GET /verify-auth`

**Authentication:**

```
Authorization: Bearer YOUR_SECRET_KEY
```

(Required only if SECRET_KEY is configured)

**Response:**

```json
{
	"success": true,
	"message": "Authentication successful",
	"authenticated": true
}
```

If authentication fails, the server will return a 401 Unauthorized response.

## Security Considerations

- Authentication via SECRET_KEY environment variable
- Code is executed in isolated environments using Node.js child processes
- Execution timeout prevents infinite loops and long-running processes
- Dependencies are automatically detected and installed from code
- Dependency caching improves performance and reduces npm requests
- Automatic cleanup of execution directories after code runs
- Native Node.js modules detection to prevent unnecessary installations
