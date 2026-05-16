
const fs = require('fs');
const path = require('path');

function checkEnv(file) {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) {
    console.log(`${file} NOT FOUND at ${p}`);
    return;
  }
  console.log(`--- ${file} ---`);
  console.log(fs.readFileSync(p, 'utf8'));
}

checkEnv('.env');
checkEnv('.env.local');
checkEnv('.env.development');
checkEnv('.env.development.local');
