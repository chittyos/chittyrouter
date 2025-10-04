# ChittyRouter MCP Extension for Claude Desktop

This extension provides 23 tools for ChittyOS integration directly within Claude Desktop, enabling seamless access to file operations, git management, web APIs, databases, AI services, and system administration.

## Features

- **23 Tools Across 17 Categories**:
  - File Operations (read, write, list directories)
  - Git Operations (status, commit, branch management)
  - Web Operations (HTTP requests, API calls)
  - Database Operations (SQL queries, data management)
  - ChittyOS Integration (ChittyID generation, service sync)
  - AI Operations (content analysis, model inference)
  - Project Management (status tracking, workflows)
  - System Operations (health checks, monitoring)
  - Security (encryption, data validation)
  - Backup & Restore (data backup, recovery)
  - Deployment (service deployment, configuration)
  - Logging & Monitoring (log search, metrics)
  - Reporting (health, usage, performance reports)

## Installation

### Method 1: Claude Desktop Extension Settings

1. Open Claude Desktop
2. Go to **Extension Settings**
3. Enable **"Use Built-in Node.js for MCP"** (recommended)
4. Add the extension configuration:

```json
{
  "mcpServers": {
    "chittyrouter-mcp": {
      "command": "node",
      "args": [
        "/Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter/src/mcp-server.js"
      ],
      "env": {
        "CHITTY_MCP_SERVER": "true",
        "MCP_SERVER_NAME": "ChittyRouter MCP",
        "MCP_SERVER_VERSION": "2.1.0",
        "CHITTYOS_INTEGRATION": "true"
      }
    }
  }
}
```

### Method 2: Manual Configuration

1. Copy the configuration from `claude-desktop-config.json` to your Claude Desktop settings
2. Restart Claude Desktop
3. Verify the extension appears in the MCP servers list

## System Requirements

- **Node.js**: 18.0.0 or higher (built-in Node.js 22.18.0 recommended)
- **Python**: 3.13.7 or higher (for certain tools)
- **Operating System**: macOS, Linux, or Windows
- **Claude Desktop**: Latest version

## Usage

Once installed, you can use ChittyRouter MCP tools directly in your Claude conversations:

### File Operations
```
Please read the contents of /path/to/file.txt
```

### Git Operations
```
Check the git status of this repository
```

### ChittyOS Integration
```
Generate a new ChittyID for a PERSON entity
```

### AI Analysis
```
Analyze this email content for priority and sentiment
```

### System Health
```
Check the health of all ChittyOS services
```

## Available Tools

### Core Tools (23 total):

1. **read_file** - Read file contents
2. **write_file** - Write content to files
3. **list_directory** - List directory contents
4. **git_status** - Get repository status
5. **git_commit** - Create git commits
6. **fetch_url** - Make HTTP requests
7. **query_database** - Execute SQL queries
8. **chittyid_generate** - Generate ChittyIDs
9. **chittyos_sync** - Sync with ChittyOS services
10. **ai_analyze** - AI content analysis
11. **project_status** - Get project status
12. **system_health** - Check system health
13. **encrypt_data** - Encrypt sensitive data
14. **decrypt_data** - Decrypt data
15. **validate_schema** - Validate against ChittyOS schemas
16. **backup_data** - Create data backups
17. **restore_data** - Restore from backups
18. **monitor_service** - Monitor service metrics
19. **deploy_service** - Deploy ChittyOS services
20. **search_logs** - Search system logs
21. **generate_report** - Generate system reports
22. **execute_workflow** - Run ChittyOS workflows
23. **Additional specialized tools**

## Configuration Options

### Extension Settings
- **Enable auto-updates**: Automatically update the extension
- **Use Built-in Node.js**: Use Claude's built-in Node.js runtime
- **Auto-connect**: Automatically connect on startup

### Environment Variables
- `CHITTY_MCP_SERVER=true` - Enable MCP server mode
- `MCP_SERVER_NAME` - Server display name
- `CHITTYOS_INTEGRATION=true` - Enable ChittyOS features

## Troubleshooting

### Extension Not Loading
1. Verify Node.js version (18+)
2. Check file permissions on mcp-server.js
3. Ensure Claude Desktop has necessary permissions
4. Restart Claude Desktop

### Tools Not Working
1. Check the extension logs in Claude Desktop
2. Verify ChittyOS services are running
3. Test individual tools one at a time
4. Check network connectivity for web-based tools

### Permission Issues
1. Grant Claude Desktop necessary system permissions
2. Check file/directory access permissions
3. Verify git repository access
4. Ensure database connection credentials

## Development

### Testing Locally
```bash
# Test the MCP server directly
node src/mcp-server.js

# Run with debug logging
DEBUG=* node src/mcp-server.js
```

### Building
```bash
npm install
npm run lint
npm run test
```

## Support

- **Documentation**: See ChittyRouter CLAUDE.md
- **Issues**: Report via GitHub Issues
- **ChittyOS Services**: https://chitty.cc
- **Health Endpoint**: https://mcp.chitty.cc/health

## License

MIT License - See LICENSE file for details.

---

**ChittyOS Integration Ready** ✅
This extension provides seamless integration with the complete ChittyOS ecosystem, including ChittyID generation, service discovery, AI analysis, and cross-platform synchronization.