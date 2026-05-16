
const dotenv = require('dotenv');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

function normalizeSunoBaseUrl(url) {
  let s = (url || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

async function sunoFetchJson(path) {
  const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";
  const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
  
  console.log(`Using Base: ${base}`);
  console.log(`Using Key: ${apiKey ? 'PRESENT' : 'MISSING'}`);

  if (!apiKey) {
      return { error: 'Missing API Key' };
  }

  try {
    const r = await fetch(new URL(path, base).toString(), {
        method: "GET",
        headers: { authorization: `Bearer ${apiKey}` },
    });
    const text = await r.text();
    return { status: r.status, text };
  } catch (e) {
      return { error: e.message };
  }
}

async function test() {
    console.log('Testing /api/v1/generate/credit...');
    const res = await sunoFetchJson('/api/v1/generate/credit');
    console.log('Result:', res);
}

test();
