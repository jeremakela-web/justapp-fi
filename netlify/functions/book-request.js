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

function resp(body, status) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return resp({ ok: false, error: 'Method not allowed' }, 405);

  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return resp({ ok: false, error: 'Unauthorized' }, 401);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return resp({ ok: false, error: 'Unauthorized' }, 401);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return resp({ ok: false, error: 'Invalid JSON' }, 400); }

  const {
    service_type,
    scheduled_at,
    notes,
    provider_id,
    customer_name,
    customer_email,
    service_details,
    price,
  } = body;

  if (!service_type || !scheduled_at) {
    return resp({ ok: false, error: 'Missing required fields', hint: 'service_type and scheduled_at are required' }, 400);
  }

  const row = {
    user_id:      user.id,
    service_type,
    scheduled_at,
    status:       'pending',
    notes:        notes        || null,
    provider_id:  provider_id  || null,
    customer_name:  customer_name  || user.user_metadata?.full_name || null,
    customer_email: customer_email || user.email || null,
    service_details: service_details || null,
    price:        price !== undefined ? price : null,
  };

  const { data, error } = await supabase
    .from('bookings')
    .insert(row)
    .select()
    .single();

  if (error) {
    return resp({
      ok:      false,
      error:   error.message,
      hint:    error.hint    || null,
      details: error.details || null,
      code:    error.code    || null,
    }, 500);
  }

  return resp({ ok: true, bookingId: data.id, booking: data }, 201);
};
