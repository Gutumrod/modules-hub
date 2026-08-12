export type Job<TPayload = Record<string, unknown>> = {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly attempt: number;
  readonly createdAt: string;
  readonly maxAttempts?: number;
};

export type JobResult<TResult = unknown> = {
  readonly success: boolean;
  readonly retryable?: boolean;
  readonly result?: TResult;
  readonly error?: {
    message: string;
    code?: string;
    stack?: string;
  };
};

export type RetryPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  timeoutMs?: number;
};

export interface JobHandler<TPayload = any, TResult = any> {
  execute(job: Job<TPayload>): Promise<JobResult<TResult>>;
}

export interface JobRunner {
  run<TPayload, TResult>(
    handler: JobHandler<TPayload, TResult>,
    job: Job<TPayload>,
    policy?: Partial<RetryPolicy>
  ): Promise<JobResult<TResult>>;
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dlq';

export type PersistentJob<T = unknown> = {
  id: string;
  name: string;
  payload: T;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export interface JobStorageAdapter {
  saveJob(job: PersistentJob): Promise<void>;
  getJob(id: string): Promise<PersistentJob | null>;
  updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void>;
  moveToDlq(id: string, reason: string): Promise<void>;
}
