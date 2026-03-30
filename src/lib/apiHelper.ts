import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export { supabase };

export async function verifyAdmin(authHeader: string | null) {
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  
  const { data: row } = await supabase
    .from('council_users')
    .select('role, approved, disabled')
    .eq('auth_uid', user.id)
    .limit(1)
    .maybeSingle();
  
  if (!row || !row.approved || row.disabled || row.role !== 'admin') return null;
  return user;
}

export async function verifyMember(authHeader: string | null) {
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  
  const { data: row } = await supabase
    .from('council_users')
    .select('role, approved, disabled, full_name, student_id')
    .eq('auth_uid', user.id)
    .limit(1)
    .maybeSingle();
  
  if (!row || !row.approved || row.disabled) return null;
  return { ...user, ...row };
}