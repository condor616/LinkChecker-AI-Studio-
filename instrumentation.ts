export async function register() {
  console.log('🚀 [Instrumentation] Starting registration...');
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log(`🌍 [Instrumentation] Runtime: nodejs, RUN_MIGRATIONS: ${process.env.RUN_MIGRATIONS}`);
    // Run database migrations on startup if enabled (used in Docker)
    if (process.env.RUN_MIGRATIONS === 'true') {
      try {
        const { runMigrations } = await import('./lib/db/migrate');
        await runMigrations();
      } catch (err: any) {
        console.error('❌ [Instrumentation] Migration error:', err.message);
      }
    }
  }
}
