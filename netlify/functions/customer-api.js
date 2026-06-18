const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function ok(body, status = 200) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}
function err(msg, status = 400) {
  return { statusCode: status, headers: CORS, body: JSON.stringify({ error: msg }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return err('Unauthorized', 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return err('Unauthorized', 401);

  try {
    const body   = JSON.parse(event.body || '{}');
    const action = body.action;

    /* ── getBookings ── */
    if (action === 'getBookings') {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return ok(data);
    }

    /* ── createBooking ── */
    if (action === 'createBooking') {
      const { service_type, scheduled_at, notes } = body;
      if (!service_type || !scheduled_at) return err('Missing service_type or scheduled_at');
      const { data, error } = await supabase
        .from('bookings')
        .insert({ user_id: user.id, service_type, scheduled_at, notes: notes || null, status: 'pending' })
        .select()
        .single();
      if (error) throw error;
      return ok(data, 201);
    }

    /* ── getProfile ── */
    if (action === 'getProfile') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      return ok({ profile: profile || null, user: { email: user.email, created_at: user.created_at } });
    }

    /* ── upsertProfile ── */
    if (action === 'upsertProfile') {
      const { full_name, phone } = body;
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, full_name, phone, updated_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      return ok(data);
    }

    return err('Unknown action', 400);
  } catch (e) {
    return err(e.message, 500);
  }
};
