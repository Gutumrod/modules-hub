import { JobStorageAdapter, PersistentJob, JobStatus } from '../core/types';

export class MemoryJobStorage implements JobStorageAdapter {
  private store = new Map<string, PersistentJob>();
  private dlq = new Map<string, { job: PersistentJob; reason: string }>();

  async saveJob(job: PersistentJob): Promise<void> {
    this.store.set(job.id, { ...job, updatedAt: Date.now() });
  }

  async getJob(id: string): Promise<PersistentJob | null> {
    return this.store.get(id) || null;
  }

  async updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void> {
    const job = this.store.get(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    job.status = status;
    job.updatedAt = Date.now();
    if (error) job.error = error;
    if (status === 'failed' || status === 'completed') {
      job.attempts += 1;
    }
    this.store.set(id, job);
  }

  async moveToDlq(id: string, reason: string): Promise<void> {
    const job = this.store.get(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    job.status = 'dlq';
    job.error = reason;
    job.updatedAt = Date.now();
    this.dlq.set(id, { job, reason });
    this.store.set(id, job);
  }

  getDlqJobs() {
    return Array.from(this.dlq.values());
  }
}
