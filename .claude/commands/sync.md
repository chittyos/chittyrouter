# Sync Command

Trigger bidirectional todo synchronization with ChittyOS Hub.

This command:
1. Pulls todos from todohub.chitty.cc
2. Merges remote todos with local todos
3. Resolves conflicts using vector clocks
4. Pushes consolidated todos back to hub

Run the bidirectional todo sync script:

```bash
./scripts/bidirectional-todo-sync.sh
```
