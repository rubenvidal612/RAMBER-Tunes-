
import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/app/version');
    const data = await res.json();
    console.log('Response from Proxy:', data);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
