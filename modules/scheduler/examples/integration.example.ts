import { MemorySchedulerEngine } from '../index.js';

/**
 * 1. Initialize Scheduler Engine
 */
const scheduler = new MemorySchedulerEngine();

/**
 * 2. Setup Trigger Listener
 * In a real app, this would route to a Job Runner
 */
scheduler.onTrigger((event) => {
  console.log(`[${event.triggeredAt}] Triggering Task: ${event.taskType}`);
  console.log(`Payload:`, event.payload);
  
  // Example: Route to JobRunner
  // runner.run(getHandler(event.taskType), { ...event });
});

/**
 * 3. Register Schedules
 */
scheduler.register({
  id: 'cleanup-logs',
  type: 'interval',
  value: 5000, // 5 seconds
  taskType: 'LOG_CLEANUP',
  payload: { olderThanDays: 7 },
  enabled: true
});

scheduler.register({
  id: 'daily-report',
  type: 'cron',
  value: '0 0 * * *',
  taskType: 'GENERATE_REPORT',
  enabled: true
});

/**
 * 4. Start Scheduler
 */
console.log('Scheduler starting...');
scheduler.start();

// Simulate a Cron trigger from an external source (e.g. Cloudflare Scheduled Event)
setTimeout(() => {
  console.log('Simulating manual Cron trigger for daily-report...');
  scheduler.triggerById('daily-report');
}, 2000);

// Stop after 12 seconds for demonstration
setTimeout(() => {
  console.log('Stopping scheduler...');
  scheduler.stop();
}, 12000);
