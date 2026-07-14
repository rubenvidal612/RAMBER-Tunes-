
const { execSync } = require('child_process');
const path = require('path');

try {
  // Get the diff for all files
  const diff = execSync('git diff', { encoding: 'utf8', cwd: __dirname });
  console.log('Git diff:\n');
  console.log(diff);
} catch (e) {
  console.error('Error:', e);
  if (e.stdout) console.log('stdout:', e.stdout.toString());
  if (e.stderr) console.error('stderr:', e.stderr.toString());
}
