export async function remoteLog(level: 'info' | 'warn' | 'error' | 'debug' | 'log', message: string, meta ? : any) {
  if (typeof window === 'undefined') return;
  // ป้องกันสแปม / เปิดเฉพาะเมื่ออยาก debug เท่านั้น
  if (process.env.NEXT_PUBLIC_ENABLE_REMOTE_LOG !== '1') return;
  
  try {
    await fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level, message, meta }),
    });
  } catch {
    // ไม่ต้องทำอะไรต่อหากส่งล้ม
  }
}

// สะดวกเรียก
export const rlog = (message: string, meta ? : any) => { void remoteLog('info', message, meta); };
export const rerr = (message: string, meta ? : any) => { void remoteLog('error', message, meta); };