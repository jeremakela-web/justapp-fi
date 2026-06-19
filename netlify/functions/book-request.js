const SUPA_URL = 'https://mebuynheutnegvvofnrl.supabase.co';

async function verifyUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const res = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function supaFetch(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPA_URL}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const user = await verifyUser(event.headers.authorization);
  if (!user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, error: 'Unauthorized' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'Invalid JSON' }) }; }

  const { service_type, scheduled_at, notes, provider_id } = body;

  if (!service_type) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'service_type required' }) };
  }

  const res = await supaFetch('/rest/v1/bookings', {
    method: 'POST',
    body: JSON.stringify({
      user_id:      user.id,
      service_type,
      scheduled_at: scheduled_at  || null,
      notes:        notes         || null,
      status:       'pending',
      provider_id:  provider_id   || null,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const row = Array.isArray(data) ? data[0] : data;
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({
        ok:      false,
        error:   row?.message   || 'Insert failed',
        hint:    row?.hint      || null,
        details: row?.details   || null,
        code:    row?.code      || null,
      }),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { statusCode: 201, headers: CORS, body: JSON.stringify({ ok: true, bookingId: row?.id, booking: row }) };
};
