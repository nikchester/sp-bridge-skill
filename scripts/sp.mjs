#!/usr/bin/env node
// sp: command-line wrapper for the SuperSync MCP bridge (Super Productivity tasks).
// No dependencies. Needs Node 18 or newer.
//
//   sp tools                       list the tools the bridge offers (name, read-only flag, summary)
//   sp status                      get_sync_status
//   sp today                       list_today
//   sp tasks [json]                list_tasks, paged: '{"offset":0,"limit":50}' (limit 100 at most)
//   sp projects | tags             list_projects, list_tags
//   sp search '<json>'             search_tasks, for example '{"text":"report","isDone":false}'
//   sp task <id>                   get_task
//   sp worklog [from] [to]         worklog_report, dates as YYYY-MM-DD (default: current week)
//   sp call <tool> ['<json>']      any tool by name
//
// Environment:
//   SUPERSYNC_MCP_KEY   required. The bridge access key. The wrapper never prints it.
//   SUPERSYNC_MCP_URL   optional. Default http://127.0.0.1:1901/mcp
//
// Safety: the wrapper refuses every tool that is not marked read-only by the bridge.
// To call a write tool, add --write. Ask the owner first. See SKILL.md.

const URL_ = process.env.SUPERSYNC_MCP_URL || 'http://127.0.0.1:1901/mcp';
const KEY = process.env.SUPERSYNC_MCP_KEY || '';
const TIMEOUT_MS = 180_000;

class Fail extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

function parseRpc(text) {
  const match = text.match(/data: (\{.*\})/) ?? text.match(/(\{.*\})/s);
  return match ? JSON.parse(match[1]) : undefined;
}

async function rpc(method, params) {
  if (!KEY) throw new Fail('SUPERSYNC_MCP_KEY is not set. Ask the owner to attach the secret to this agent.', 2);
  let response;
  try {
    response = await fetch(URL_, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const code = error?.cause?.code ?? error?.name ?? 'ERROR';
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND') {
      throw new Fail(`Cannot reach the bridge at ${URL_} (${code}). This agent may run outside the bridge network. Tell the owner.`, 3);
    }
    if (code === 'TimeoutError') {
      throw new Fail('The bridge did not answer in 180 s. After a restart it needs about 2 minutes to warm up. Try again.', 4);
    }
    throw new Fail(`Request failed (${code}).`, 4);
  }
  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new Fail(`The bridge rejected the key (HTTP ${response.status}). Tell the owner.`, 5);
  }
  let body;
  try {
    body = parseRpc(text);
  } catch {
    body = undefined;
  }
  if (response.status !== 200 || !body) throw new Fail(`Unexpected answer from the bridge (HTTP ${response.status}).`, 4);
  if (body.error) throw new Fail(`The bridge reported an error: ${String(body.error.message).slice(0, 300)}`, 6);
  return body.result ?? {};
}

async function listTools() {
  const result = await rpc('tools/list', {});
  return result.tools ?? [];
}

function firstSentence(text = '') {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const end = clean.search(/[.!?](\s|$)/);
  return (end > 0 ? clean.slice(0, end + 1) : clean).slice(0, 140);
}

async function callTool(name, args, allowWrite) {
  const tools = await listTools();
  const tool = tools.find((item) => item.name === name);
  if (!tool) {
    const names = tools.map((item) => item.name).join(', ');
    throw new Fail(`The bridge has no tool "${name}". Available: ${names || '(none)'}`, 7);
  }
  const readOnly = tool.annotations?.readOnlyHint === true;
  if (!readOnly && !allowWrite) {
    throw new Fail(`"${name}" changes the owner's tasks. Refused. Ask the owner, then repeat with --write.`, 8);
  }
  const result = await rpc('tools/call', { name, arguments: args });
  const text = (result.content ?? []).find((item) => item.type === 'text')?.text;
  if (result.isError) throw new Fail(`Tool "${name}" failed: ${String(text ?? '').slice(0, 300)}`, 6);
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return String(text ?? '');
  }
}

function jsonArg(value, label) {
  if (value === undefined) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new Fail(`${label} must be a JSON object, for example '{"text":"report"}'.`, 9);
  }
}

async function main(argv) {
  const allowWrite = argv.includes('--write');
  const args = argv.filter((item) => item !== '--write');
  const [command, ...rest] = args;

  switch (command) {
    case 'tools': {
      const tools = await listTools();
      for (const tool of tools.sort((a, b) => a.name.localeCompare(b.name))) {
        const flag = tool.annotations?.readOnlyHint === true ? 'read ' : 'WRITE';
        console.log(`${flag}  ${tool.name}  -  ${firstSentence(tool.description)}`);
      }
      return;
    }
    case 'status':
      return console.log(await callTool('get_sync_status', {}, allowWrite));
    case 'today':
      return console.log(await callTool('list_today', {}, allowWrite));
    case 'tasks':
      return console.log(await callTool('list_tasks', jsonArg(rest[0], 'The argument'), allowWrite));
    case 'projects':
      return console.log(await callTool('list_projects', jsonArg(rest[0], 'The argument'), allowWrite));
    case 'tags':
      return console.log(await callTool('list_tags', jsonArg(rest[0], 'The argument'), allowWrite));
    case 'search':
      return console.log(await callTool('search_tasks', jsonArg(rest[0], 'The argument'), allowWrite));
    case 'task':
      if (!rest[0]) throw new Fail('Usage: sp task <id>', 9);
      return console.log(await callTool('get_task', { id: rest[0] }, allowWrite));
    case 'worklog': {
      const range = {};
      if (rest[0]) range.from = rest[0];
      if (rest[1]) range.to = rest[1];
      return console.log(await callTool('worklog_report', range, allowWrite));
    }
    case 'call':
      if (!rest[0]) throw new Fail("Usage: sp call <tool> ['<json>']", 9);
      return console.log(await callTool(rest[0], jsonArg(rest[1], 'The argument'), allowWrite));
    default:
      throw new Fail(
        'Usage: sp tools | status | today | tasks [json] | projects | tags | search <json> | task <id> | worklog [from] [to] | call <tool> [json]',
        9,
      );
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Fail ? error.message : 'Unexpected error.');
  process.exitCode = error instanceof Fail ? error.code : 1;
}
