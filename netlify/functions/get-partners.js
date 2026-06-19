const SUPA_URL = 'https://mebuynheutnegvvofnrl.supabase.co';

async function supaFetch(path) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPA_URL}${path}`, {
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
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

  const category = (event.queryStringParameters || {}).category;
  if (!category) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'category required' }) };

  const res = await supaFetch(
    `/rest/v1/partners?service_category=eq.${encodeURIComponent(category)}&active=eq.true` +
    `&select=id,company_name,contact_name,city,rating,job_count,bio,bio_en,avatar_url` +
    `&order=rating.desc.nullslast`
  );

  if (!res.ok) {
    const err = await res.text();
    return { statusCode: res.status, headers: CORS, body: err };
  }

  const data = await res.json();
  return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
};
