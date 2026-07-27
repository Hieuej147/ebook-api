import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import type { BaseEvent, RunAgentInput } from '@ag-ui/client';
import type { AgentRunKind, EventStore, RunStatus, StoredRunEvent, StoreDriver } from '../types.js';

export interface RunStartMetadata {
  parentRunId?: string;
  rootRunId?: string;
  depth?: number;
  kind?: AgentRunKind;
}

type RunRow = { runId: string; status: RunStatus };

export class InMemoryEventStore implements EventStore {
  private readonly runs = new Map<string, { runId: string; status: RunStatus; events: StoredRunEvent[] }>();
  async startRun(threadId: string, runId: string, _input: RunAgentInput, _agentId: string, _metadata?: RunStartMetadata): Promise<void> {
    if (this.runs.get(threadId)?.status === 'running') throw new Error(`Thread "${threadId}" already has a running agent`);
    this.runs.set(threadId, { runId, status: 'running', events: [] });
  }
  async append(event: StoredRunEvent): Promise<void> { const run = this.runs.get(event.threadId); if (run?.runId === event.runId) run.events.push(event); }
  async appendBatch(events: StoredRunEvent[]): Promise<void> { for (const event of events) await this.append(event); }
  async replaceRunEvents(threadId: string, runId: string, events: StoredRunEvent[]): Promise<void> { const run = this.runs.get(threadId); if (!run || run.runId !== runId) return; run.events = events; }
  async finishRun(threadId: string, runId: string, status: RunStatus): Promise<void> { const run = this.runs.get(threadId); if (run?.runId === runId) run.status = status; }
  async history(threadId: string): Promise<StoredRunEvent[]> { return [...(this.runs.get(threadId)?.events ?? [])]; }
  async active(threadId: string): Promise<{ runId: string; status: 'running' } | null> { const run = this.runs.get(threadId); return run?.status === 'running' ? { runId: run.runId, status: 'running' } : null; }
  async removeThread(threadId: string): Promise<void> { this.runs.delete(threadId); }
}

export interface SqliteEventStoreOptions { path: string; }

export class SqliteEventStore implements EventStore {
  private readonly db: Database.Database;
  constructor(options: SqliteEventStoreOptions) {
    mkdirSync(dirname(options.path), { recursive: true });
    this.db = new Database(options.path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS thread_manager_runs (
        thread_id TEXT NOT NULL, run_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
        parent_run_id TEXT, root_run_id TEXT NOT NULL, depth INTEGER NOT NULL DEFAULT 0,
        kind TEXT NOT NULL DEFAULT 'root', input_json TEXT NOT NULL, status TEXT NOT NULL,
        started_at INTEGER NOT NULL, finished_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_thread_manager_runs_thread_parent ON thread_manager_runs(thread_id, parent_run_id);
      CREATE UNIQUE INDEX IF NOT EXISTS thread_manager_one_active_run ON thread_manager_runs(thread_id) WHERE status = 'running';
      CREATE TABLE IF NOT EXISTS thread_manager_events (
        thread_id TEXT NOT NULL, run_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        event_json TEXT NOT NULL, PRIMARY KEY (run_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_thread_manager_events_thread ON thread_manager_events(thread_id, run_id, sequence);
    `);
  }
  async startRun(threadId: string, runId: string, input: RunAgentInput, agentId: string, metadata: RunStartMetadata = {}): Promise<void> {
    const running = this.db.prepare("SELECT run_id FROM thread_manager_runs WHERE thread_id = ? AND status = 'running'").get(threadId) as { run_id: string } | undefined;
    if (running) throw new Error(`Thread "${threadId}" already has a running agent`);
    this.db.prepare(`INSERT INTO thread_manager_runs (thread_id, run_id, agent_id, parent_run_id, root_run_id, depth, kind, input_json, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`)
      .run(threadId, runId, agentId, metadata.parentRunId ?? null, metadata.rootRunId ?? runId, metadata.depth ?? 0, metadata.kind ?? 'root', JSON.stringify(input), Date.now());
  }
  async append(event: StoredRunEvent): Promise<void> { this.db.prepare('INSERT OR REPLACE INTO thread_manager_events (thread_id, run_id, sequence, event_json) VALUES (?, ?, ?, ?)').run(event.threadId, event.runId, event.sequence, JSON.stringify(event.event)); }
  async appendBatch(events: StoredRunEvent[]): Promise<void> { const insert = this.db.prepare('INSERT OR REPLACE INTO thread_manager_events (thread_id, run_id, sequence, event_json) VALUES (?, ?, ?, ?)'); this.db.transaction((items: StoredRunEvent[]) => { for (const event of items) insert.run(event.threadId, event.runId, event.sequence, JSON.stringify(event.event)); })(events); }
  async replaceRunEvents(threadId: string, runId: string, events: StoredRunEvent[]): Promise<void> { this.db.transaction(() => { this.db.prepare('DELETE FROM thread_manager_events WHERE thread_id = ? AND run_id = ?').run(threadId, runId); const insert = this.db.prepare('INSERT INTO thread_manager_events (thread_id, run_id, sequence, event_json) VALUES (?, ?, ?, ?)'); for (const event of events) insert.run(event.threadId, event.runId, event.sequence, JSON.stringify(event.event)); })(); }
  async finishRun(threadId: string, runId: string, status: RunStatus): Promise<void> { this.db.prepare('UPDATE thread_manager_runs SET status = ?, finished_at = ? WHERE thread_id = ? AND run_id = ?').run(status, Date.now(), threadId, runId); }
  async history(threadId: string): Promise<StoredRunEvent[]> {
    const rows = this.db.prepare('SELECT thread_id, run_id, sequence, event_json FROM thread_manager_events WHERE thread_id = ? ORDER BY rowid ASC').all(threadId) as Array<{ thread_id: string; run_id: string; sequence: number; event_json: string }>;
    return rows.map((row) => ({ threadId: row.thread_id, runId: row.run_id, sequence: row.sequence, event: JSON.parse(row.event_json) as BaseEvent }));
  }
  async active(threadId: string): Promise<{ runId: string; status: 'running' } | null> { const row = this.db.prepare("SELECT run_id FROM thread_manager_runs WHERE thread_id = ? AND status = 'running'").get(threadId) as { run_id: string } | undefined; return row ? { runId: row.run_id, status: 'running' } : null; }
  async removeThread(threadId: string): Promise<void> { this.db.transaction(() => { this.db.prepare('DELETE FROM thread_manager_events WHERE thread_id = ?').run(threadId); this.db.prepare('DELETE FROM thread_manager_runs WHERE thread_id = ?').run(threadId); })(); }
  close(): void { this.db.close(); }
}

export interface PostgresEventStoreOptions { connectionString: string; schema?: string; }

export class PostgresEventStore implements EventStore {
  readonly pool: Pool;
  private readonly schema: string;
  private initialized = false;
  constructor(options: PostgresEventStoreOptions) { this.pool = new Pool({ connectionString: options.connectionString }); this.schema = options.schema ?? 'public'; }
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const client = await this.pool.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${this.schema}".thread_manager_runs (
          thread_id TEXT NOT NULL, run_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
          parent_run_id TEXT, root_run_id TEXT NOT NULL, depth INTEGER NOT NULL DEFAULT 0,
          kind TEXT NOT NULL DEFAULT 'root', input_json JSONB NOT NULL, status TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS thread_manager_runs_thread_parent ON "${this.schema}".thread_manager_runs(thread_id, parent_run_id);
        CREATE UNIQUE INDEX IF NOT EXISTS thread_manager_one_active_run ON "${this.schema}".thread_manager_runs(thread_id) WHERE status = 'running';
        CREATE TABLE IF NOT EXISTS "${this.schema}".thread_manager_events (
          thread_id TEXT NOT NULL, run_id TEXT NOT NULL, sequence INTEGER NOT NULL,
          event_json JSONB NOT NULL, PRIMARY KEY (run_id, sequence)
        );
        CREATE INDEX IF NOT EXISTS thread_manager_events_thread_sequence ON "${this.schema}".thread_manager_events(thread_id, run_id, sequence);
      `);
      this.initialized = true;
    } finally { client.release(); }
  }
  async startRun(threadId: string, runId: string, input: RunAgentInput, agentId: string, metadata: RunStartMetadata = {}): Promise<void> {
    await this.initialize();
    try {
      await this.pool.query(`INSERT INTO "${this.schema}".thread_manager_runs (thread_id, run_id, agent_id, parent_run_id, root_run_id, depth, kind, input_json, status, started_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'running',NOW())`, [threadId, runId, agentId, metadata.parentRunId ?? null, metadata.rootRunId ?? runId, metadata.depth ?? 0, metadata.kind ?? 'root', JSON.stringify(input)]);
    } catch (error) { if (error instanceof Error && error.message.includes('thread_manager_one_active_run')) throw new Error(`Thread "${threadId}" already has a running agent`); throw error; }
  }
  async append(event: StoredRunEvent): Promise<void> { await this.initialize(); await this.pool.query(`INSERT INTO "${this.schema}".thread_manager_events (thread_id, run_id, sequence, event_json) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (run_id, sequence) DO UPDATE SET event_json = EXCLUDED.event_json`, [event.threadId, event.runId, event.sequence, JSON.stringify(event.event)]); }
  async appendBatch(events: StoredRunEvent[]): Promise<void> { if (events.length === 0) return; const client = await this.pool.connect(); try { await client.query('BEGIN'); for (const event of events) await client.query(`INSERT INTO "${this.schema}".thread_manager_events (thread_id, run_id, sequence, event_json) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (run_id, sequence) DO UPDATE SET event_json = EXCLUDED.event_json`, [event.threadId, event.runId, event.sequence, JSON.stringify(event.event)]); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  async replaceRunEvents(threadId: string, runId: string, events: StoredRunEvent[]): Promise<void> { await this.initialize(); const client = await this.pool.connect(); try { await client.query('BEGIN'); await client.query(`DELETE FROM "${this.schema}".thread_manager_events WHERE thread_id=$1 AND run_id=$2`, [threadId, runId]); for (const event of events) await client.query(`INSERT INTO "${this.schema}".thread_manager_events (thread_id, run_id, sequence, event_json) VALUES ($1,$2,$3,$4::jsonb)`, [event.threadId, event.runId, event.sequence, JSON.stringify(event.event)]); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  async finishRun(threadId: string, runId: string, status: RunStatus): Promise<void> { await this.initialize(); await this.pool.query(`UPDATE "${this.schema}".thread_manager_runs SET status=$1, finished_at=NOW() WHERE thread_id=$2 AND run_id=$3`, [status, threadId, runId]); }
  async history(threadId: string): Promise<StoredRunEvent[]> { await this.initialize(); const result = await this.pool.query(`SELECT thread_id, run_id, sequence, event_json FROM "${this.schema}".thread_manager_events WHERE thread_id=$1 ORDER BY run_id, sequence`, [threadId]); return result.rows.map((row: { thread_id: string; run_id: string; sequence: number; event_json: BaseEvent }) => ({ threadId: row.thread_id, runId: row.run_id, sequence: row.sequence, event: row.event_json })); }
  async active(threadId: string): Promise<{ runId: string; status: 'running' } | null> { await this.initialize(); const result = await this.pool.query(`SELECT run_id FROM "${this.schema}".thread_manager_runs WHERE thread_id=$1 AND status='running'`, [threadId]); return result.rows[0] ? { runId: String(result.rows[0].run_id), status: 'running' } : null; }
  async removeThread(threadId: string): Promise<void> { await this.initialize(); const client = await this.pool.connect(); try { await client.query('BEGIN'); await client.query(`DELETE FROM "${this.schema}".thread_manager_events WHERE thread_id=$1`, [threadId]); await client.query(`DELETE FROM "${this.schema}".thread_manager_runs WHERE thread_id=$1`, [threadId]); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  async close(): Promise<void> { await this.pool.end(); }
}

export interface EventStoreFactoryOptions { sqlitePath?: string; databaseUrl?: string; postgresSchema?: string; }
export async function createEventStore(driver: StoreDriver = (process.env.STORE_DRIVER as StoreDriver | undefined) ?? 'sqlite', options: EventStoreFactoryOptions = {}): Promise<EventStore> {
  if (driver === 'memory') return new InMemoryEventStore();
  if (driver === 'sqlite') return new SqliteEventStore({ path: options.sqlitePath ?? process.env.SQLITE_PATH ?? resolve(process.cwd(), '.data/conversation-threads.sqlite') });
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required when STORE_DRIVER=postgres');
  const store = new PostgresEventStore({ connectionString: databaseUrl, schema: options.postgresSchema ?? process.env.POSTGRES_SCHEMA });
  await store.initialize();
  return store;
}
