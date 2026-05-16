
import { loadEnv } from 'vite';
import fs from 'fs';

const mode = 'development';
const env = loadEnv(mode, '.', '');

console.log('--- ENV CHECK ---');
console.log('API_BASE_URL:', env.API_BASE_URL);
console.log('NEXT_PUBLIC_SITE_URL:', env.NEXT_PUBLIC_SITE_URL);
console.log('VITE_SITE_URL:', env.VITE_SITE_URL);
console.log('NEXT_PUBLIC_VERCEL_URL:', env.NEXT_PUBLIC_VERCEL_URL);
console.log('-----------------');
