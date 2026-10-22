/** Job queue (FR-ARC-05): id, state, progress, logs and cancellation for long work. */
import { randomUUID } from 'node:crypto';
import { FrameError } from '@frame/schema';

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  kind: string;
  project?: string;
  title: string;
  state: JobState;
  progress: number;
  message: string;
  logs: string[];
  result?: unknown;
  error?: { code: string; message: string; details?: unknown; hint?: string };
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface JobContext {
  signal: AbortSignal;
  progress(p: number, message?: string): void;
  log(line: string): void;
}

type Runner = (ctx: JobContext) => Promise<unknown>;

export class JobQueue {
  private jobs = new Map<string, Job>();
  private ctl = new Map<string, AbortController>();
  private queue: { job: Job; run: Runner }[] = [];
  private running = 0;
  private listeners = new Set<(j: Job) => void>();

  /** Concurrency per queue; renders and voice work each get their own queue in the server. */
  constructor(private readonly concurrency = 1, private readonly keep = 200) {}

  onChange(fn: (j: Job) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(j: Job) {
    for (const fn of this.listeners) fn(j);
  }

  list(project?: string): Job[] {
    return [...this.jobs.values()].filter((j) => !project || j.project === project).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  submit(kind: string, title: string, run: Runner, project?: string): Job {
    const job: Job = { id: `job_${randomUUID()}`, kind, title, state: 'queued', progress: 0, message: 'Queued', logs: [], createdAt: new Date().toISOString(), ...(project ? { project } : {}) };
    this.jobs.set(job.id, job);
    this.ctl.set(job.id, new AbortController());
    this.queue.push({ job, run });
    this.trim();
    this.emit(job);
    this.pump();
    return job;
  }

  cancel(id: string): boolean {
    const j = this.jobs.get(id);
    if (!j || (j.state !== 'queued' && j.state !== 'running')) return false;
    this.ctl.get(id)?.abort();
    if (j.state === 'queued') {
      this.queue = this.queue.filter((q) => q.job.id !== id);
      this.finish(j, 'cancelled', undefined, { code: 'CANCELLED', message: 'Cancelled' });
    }
    return true;
  }

  /** Resolves when the job finishes. */
  wait(id: string): Promise<Job> {
    return new Promise((resolve) => {
      const check = (j: Job) => {
        if (j.id === id && j.state !== 'queued' && j.state !== 'running') {
          off();
          resolve(j);
        }
      };
      const off = this.onChange(check);
      const j = this.jobs.get(id);
      if (j) check(j);
    });
  }

  private pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const { job, run } = this.queue.shift()!;
      this.running++;
      job.state = 'running';
      job.startedAt = new Date().toISOString();
      job.message = 'Starting';
      this.emit(job);
      const signal = this.ctl.get(job.id)!.signal;
      let last = 0;
      const ctx: JobContext = {
        signal,
        progress: (p, message) => {
          job.progress = Math.max(0, Math.min(1, p));
          if (message) job.message = message;
          // Throttle progress events to ~10 per second.
          const t = Date.now();
          if (t - last > 100 || p >= 1) {
            last = t;
            this.emit(job);
          }
        },
        log: (line) => {
          job.logs.push(line);
          if (job.logs.length > 500) job.logs.shift();
        },
      };
      run(ctx)
        .then((result) => (signal.aborted ? this.finish(job, 'cancelled', undefined, { code: 'CANCELLED', message: 'Cancelled' }) : this.finish(job, 'succeeded', result)))
        .catch((e: unknown) => {
          const err = e instanceof FrameError ? e : new FrameError('INTERNAL', (e as Error)?.message ?? String(e));
          this.finish(job, err.code === 'CANCELLED' || signal.aborted ? 'cancelled' : 'failed', undefined, err.toJSON());
        })
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }

  private finish(job: Job, state: JobState, result?: unknown, error?: Job['error']) {
    job.state = state;
    job.finishedAt = new Date().toISOString();
    if (state === 'succeeded') {
      job.progress = 1;
      job.message = 'Done';
      job.result = result;
    } else {
      job.message = state === 'cancelled' ? 'Cancelled' : error?.message ?? 'Failed';
      if (error) job.error = error;
    }
    this.ctl.delete(job.id);
    this.emit(job);
  }

  private trim() {
    const done = [...this.jobs.values()].filter((j) => j.state !== 'queued' && j.state !== 'running');
    for (const j of done.slice(0, Math.max(0, this.jobs.size - this.keep))) this.jobs.delete(j.id);
  }
}
