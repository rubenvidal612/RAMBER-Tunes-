export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({error:'Unauthorized'});
  if (Date.now() > Date.parse('2026-10-09T00:00:00Z')) return res.status(410).json({error:'Expired'});
  let base = String(process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || 'https://api.sunoapi.org').trim().replace(/^[`"' ]+|[`"' ]+$/g,'').replace(/\/+$/,'').replace(/\/api\/v1$/i,'');
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  const key = String(process.env.SUNO_API_KEY || process.env.SUNO_KEY || '').trim().replace(/^[`"' ]+|[`"' ]+$/g,'');
  if (!key) return res.status(503).json({error:'Missing provider configuration'});
  try {
    const response = await fetch(new URL('/api/v1/generate/record-info?taskId=88af050f25505b844804ac1b2f538af7',base), {headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(45000)});
    const result = await response.json();
    const d = result?.data || {};
    const tracks = d.response?.sunoData || d.response?.data || [];
    return res.status(200).json({http:response.status,code:result?.code,message:result?.msg||result?.message,status:d.status,errorCode:d.errorCode,errorMessage:d.errorMessage,tracks:Array.isArray(tracks)?tracks.map((t:any)=>({id:t.id,hasAudio:!!(t.audioUrl||t.audio_url)})):[],dataKeys:Object.keys(d)});
  } catch (e) {return res.status(502).json({error:e instanceof Error?e.message:String(e)});}
}