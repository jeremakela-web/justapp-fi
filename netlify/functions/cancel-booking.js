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

  const { booking_id } = body;
  if (!booking_id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'booking_id required' }) };

  // Filter by both id AND user_id — user can only cancel their own bookings
  const res = await supaFetch(
    `/rest/v1/bookings?id=eq.${booking_id}&user_id=eq.${user.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }
  );

  const data = await res.json();

  if (!res.ok) {
    const row = Array.isArray(data) ? data[0] : data;
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ ok: false, error: row?.message || 'Update failed' }),
    };
  }

  const updated = Array.isArray(data) ? data[0] : data;
  if (!updated) return { statusCode: 404, headers: CORS, body: JSON.stringify({ ok: false, error: 'Booking not found or not yours' }) };

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, booking: updated }) };
};
