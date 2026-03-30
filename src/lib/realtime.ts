import { getBrowserSupabase } from '@/lib/supabaseClient';

type Unsubscribe = () => Promise<void> | void;

export function subscribeTable(
  table: string,
  callback: (payload: any) => void,
  opts?: { schema?: string; events?: Array<'INSERT'|'UPDATE'|'DELETE'|'ALL'> }
): Unsubscribe {
  // opts: schema default 'public', events default all
  const schema = opts?.schema ?? 'public';
  const events = opts?.events ?? ['ALL'];

  const supabase = getBrowserSupabase();

  // channel name unique per table
  const channel = supabase.channel(`realtime:${schema}.${table}`);

  // map events to postgres_changes events
  const postgresEvents = events.includes('ALL') ? ['INSERT', 'UPDATE', 'DELETE'] : events;

  postgresEvents.forEach(ev => {
    channel.on(
      'postgres_changes',
      { event: ev as any, schema, table },
      (payload) => {
        try { callback(payload); } catch (e) { /* swallow callback errors */ }
      }
    );
  });

  // subscribe
  channel.subscribe((status) => {
    // optional: log or handle status
  });

  // return unsubscribe
  return async () => {
    try {
      await supabase.removeChannel(channel);
    } catch {}
  };
}