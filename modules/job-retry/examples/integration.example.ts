import { 
  DefaultJobRunner, 
  type Job, 
  type JobHandler, 
  type JobResult 
} from '../index.js';

/**
 * 1. Define a Concrete Job Handler
 */
class EmailJobHandler implements JobHandler<{ email: string; body: string }> {
  async execute(job: Job<{ email: string; body: string }>): Promise<JobResult> {
    console.log(`[Attempt ${job.attempt}] Sending email to ${job.payload.email}...`);
    
    // Simulate a failure on the first attempt
    if (job.attempt === 1) {
      return {
        success: false,
        retryable: true,
        error: { message: 'SMTP Server Timeout' }
      };
    }

    // Success on subsequent attempts
    return {
      success: true,
      result: { messageId: 'msg_12345' }
    };
  }
}

/**
 * 2. Run the Job with Retry Policy
 */
async function runExample() {
  const runner = new DefaultJobRunner();
  const handler = new EmailJobHandler();

  const job: Job<{ email: string; body: string }> = {
    id: 'job_abc_123',
    type: 'send-email',
    payload: {
      email: 'user@example.com',
      body: 'Hello from Module Hub!'
    },
    attempt: 1,
    createdAt: new Date().toISOString()
  };

  console.log('Starting Job Execution...');
  
  const result = await runner.run(handler, job, {
    maxAttempts: 3,
    initialDelayMs: 500,
    backoffMultiplier: 2
  });

  if (result.success) {
    console.log('Job Succeeded:', result.result);
  } else {
    console.error('Job Failed after retries:', result.error?.message);
  }
}

runExample();
