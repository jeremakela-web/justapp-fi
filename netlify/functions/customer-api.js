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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .order('service_date', { ascending: true });
      if (error) throw error;
      return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { data, error } = await supabase
        .from('bookings')
        .insert({ ...body, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return { statusCode: 201, headers: CORS, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing id parameter' }) };
      }
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
