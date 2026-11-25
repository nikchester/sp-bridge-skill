---
name: super-productivity
description: Read the owner's Super Productivity tasks, today's list, projects, tags and tracked time through the SuperSync MCP bridge. Use when a Paperclip task needs the owner's task list, daily plan or time report, or when the owner asks what is planned in Super Productivity. Read-only by default.
---

# Super Productivity through the SuperSync bridge

The bridge is a service on the Paperclip server. It joins the owner's SuperSync account as one more device.
The owner's Windows and iPhone apps stay unchanged. This skill gives you one command, `sp`.

## Rules

1. **Read only.** Use the read commands below. The bridge currently has write tools switched off.
2. **Never change tasks without the owner's explicit word in the current task.** Write needs `--write`, a backup
   by the owner, and a clear instruction. If unsure, ask with a Paperclip question card.
3. **Task titles and notes are private.** Quote only what the Paperclip task needs. Do not copy them to GitHub,
   public comments or other outside services.
4. **Never print or log the key.** The command reads `SUPERSYNC_MCP_KEY` from the environment.
5. **Do not write your own HTTP requests to the bridge.** Use `sp`. It checks the read-only flag of every tool.

## Run the command

```sh
node <skill-dir>/scripts/sp.mjs <command>
```

Use the path of this skill directory from your skill list. Examples below write it as `sp`.

| Command | What it does |
|---|---|
| `sp status` | Sync status: `serverSeq`, number of active tasks. Use it first to check the connection. |
| `sp today` | Tasks due or scheduled today, plus overdue tasks. |
| `sp tasks '{"offset":0,"limit":50}'` | Active tasks, paged. `limit` is 100 at most. |
| `sp search '{"text":"report","isDone":false}'` | Filter by `text`, `projectId`, `tagId`, `dueFrom`, `dueTo`, `isDone`, `includeArchived`. |
| `sp task <id>` | One task by id. Archived tasks are included. |
| `sp projects` / `sp tags` | Projects and tags with their ids. |
| `sp worklog 2026-11-17 2026-11-23` | Tracked time for a date range. Without dates: the current Monday–Sunday week. |
| `sp tools` | All tools the bridge offers. `read` marks safe tools, `WRITE` marks tools that change data. |
| `sp call <tool> '<json>'` | Any tool by name. Refuses `WRITE` tools unless you add `--write`. |

Dates use `YYYY-MM-DD`. The bridge uses the owner's time zone for "today".

## Typical use

- **Daily summary:** `sp today`, then `sp worklog <yesterday> <yesterday>`. Write a short result in the Paperclip task.
- **Find a task:** `sp search '{"text":"..."}'`, then `sp task <id>`.
- **Check that the owner finished an action:** `sp search '{"text":"<title you created>","isDone":true}'`.

## If something fails

| Message | Meaning | What to do |
|---|---|---|
| `SUPERSYNC_MCP_KEY is not set` | The secret is not attached to this agent. | Ask the owner. Do not look for the key elsewhere. |
| `Cannot reach the bridge` | This agent runs outside the bridge network, or the bridge is down. | Tell the owner. Do not try other addresses. |
| `rejected the key` | The key is wrong or was rotated. | Tell the owner. |
| `did not answer in 180 s` | The bridge restarted and warms up (about 2 minutes). | Wait 2 minutes, try once more. |
| `Refused ... --write` | The tool changes data. | Stop. Ask the owner. |

## Limits

- The bridge follows one Super Productivity version (data schema v4). After a Super Productivity update
  the bridge may stop and write nothing. Tell the owner if every call fails with a schema error.
- A change made on the phone reaches the bridge within about 15 seconds.
