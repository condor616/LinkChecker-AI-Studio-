export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // BullMQ worker is now a separate process (worker/index.ts)
    // No need to start it here.
  }
}
