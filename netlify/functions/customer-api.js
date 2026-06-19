/*
  Run once in Supabase SQL Editor to create required tables:

  CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
*/

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const user = await verifyUser(event.headers.authorization);
  if (!user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, ...params } = body;

  try {
    if (action === 'getProfile') {
      const res = await supaFetch(`/rest/v1/profiles?id=eq.${user.id}&select=*`);
      const data = await res.json();
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          profile: data[0] || null,
          user: { id: user.id, email: user.email, created_at: user.created_at },
        }),
      };
    }

    if (action === 'upsertProfile') {
      const { full_name, phone } = params;
      const patchRes = await supaFetch(`/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ full_name, phone }),
      });
      const patchData = await patchRes.json();
      if (!Array.isArray(patchData) || patchData.length === 0) {
        await supaFetch('/rest/v1/profiles', {
          method: 'POST',
          body: JSON.stringify({ id: user.id, full_name, phone }),
        });
      }
      return { statusCode: 200, headers: CORS, body: '{}' };
    }

    if (action === 'getBookings') {
      const res = await supaFetch(`/rest/v1/bookings?user_id=eq.${user.id}&select=*&order=created_at.desc`);
      const data = await res.json();
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify(Array.isArray(data) ? data : []),
      };
    }

    if (action === 'createBooking') {
      const { service_type, scheduled_at, notes } = params;
      if (!service_type) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'service_type required' }) };
      const res = await supaFetch('/rest/v1/bookings', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          service_type,
          scheduled_at: scheduled_at || null,
          notes: notes || null,
          status: 'pending',
        }),
      });
      const data = await res.json();
      return {
        statusCode: 201, headers: CORS,
        body: JSON.stringify(Array.isArray(data) ? data[0] : data),
      };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
