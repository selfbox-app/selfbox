import 'dotenv/config';

async function main() {
  // Intentionally no-op by default. Projects can extend this file with fixture inserts.
  console.info('No seed data configured. Skipping.');
}

main().catch((error) => {
  console.error('Database seed failed:', error);
  process.exitCode = 1;
});
