// src/setup/cli-check.ts
import { SetupValidator } from './validator.js';

async function main() {
  console.log(`\n========================================`);
  console.log(`🔍 OpenAssistant AI — Prerequisites Check`);
  console.log(`========================================\n`);

  const validator = new SetupValidator();
  const prereqs = await validator.checkPrerequisites();

  const printTool = (name: string, check: { installed: boolean; version?: string; error?: string }) => {
    const symbol = check.installed ? '✅' : '❌';
    const status = check.installed ? `${check.version}` : `MISSING (${check.error || 'not found in PATH'})`;
    console.log(`${symbol} ${name.padEnd(16)}: ${status}`);
  };

  printTool('Node.js', prereqs.node);
  printTool('npm', prereqs.npm);
  printTool('Supabase CLI', prereqs.supabase);

  console.log(`\n----------------------------------------`);
  if (prereqs.projectConfigured) {
    console.log(`📌 Configured Supabase project_id: ${prereqs.currentProjectRef}`);
  } else {
    console.log(`ℹ️ Supabase project not yet configured.`);
  }

  if (prereqs.allSatisfied) {
    console.log(`\n🎉 All local prerequisites are satisfied!`);
    console.log(`👉 Run "npm run setup" to launch the setup wizard.\n`);
    process.exit(0);
  } else {
    console.log(`\n⚠️ Some prerequisites are missing.`);
    if (!prereqs.supabase.installed) {
      console.log(`   To install Supabase CLI: npm install -g supabase`);
    }
    console.log(``);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Prerequisites check failed:', err);
  process.exit(1);
});
