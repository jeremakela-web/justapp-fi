const SUPA_URL = 'https://mebuynheutnegvvofnrl.supabase.co';

function supaFetch(path) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPA_URL}${path}`, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function cheapestInsertionKm(newLat, newLng, prevLat, prevLng, nextLat, nextLng) {
  return haversineKm(prevLat, prevLng, newLat, newLng)
       + haversineKm(newLat, newLng, nextLat, nextLng)
       - haversineKm(prevLat, prevLng, nextLat, nextLng);
}

// Generate candidate hourly slots for a day that don't conflict with existing bookings
function candidateSlots(dateStr, existingBookings, durationMin) {
  const WS = 8, WE = 18;
  const occupied = existingBookings
    .filter(b => b.scheduled_at)
    .map(b => {
      const s = new Date(b.scheduled_at).getTime();
      return { s, e: s + (b.estimated_duration_min || durationMin) * 60000 };
    });

  const slots = [];
  for (let h = WS; h + durationMin / 60 <= WE; h++) {
    const slotStart = new Date(`${dateStr}T${String(h).padStart(2, '0')}:00:00`);
    const slotEnd   = new Date(slotStart.getTime() + durationMin * 60000);
    const ss = slotStart.getTime(), se = slotEnd.getTime();
    if (!occupied.some(o => ss < o.e && se > o.s)) {
      slots.push({ start: slotStart, end: slotEnd });
    }
  }
  return slots;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { service_lat, service_lng, service_type, service_category_id, requested_date, preferred_provider_id, postal_code } = body;

  if (!service_lat || !service_lng || !requested_date) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'service_lat, service_lng, requested_date required' }) };
  }

  // 1. Resolve service category (optional — fallback to sensible defaults)
  let category = { id: null, name: service_type || '', routing_sensitivity: 'high', typical_duration_min: 60, cluster_bonus_enabled: false };
  if (service_category_id) {
    const r = await supaFetch(`/rest/v1/service_categories?id=eq.${service_category_id}&select=*`);
    const d = await r.json();
    if (d[0]) category = d[0];
  } else if (service_type) {
    const r = await supaFetch(`/rest/v1/service_categories?name=eq.${encodeURIComponent(service_type)}&select=*`);
    const d = await r.json();
    if (d[0]) category = d[0];
  }

  const { routing_sensitivity, typical_duration_min, cluster_bonus_enabled } = category;

  // 2. Fetch candidate partners
  let partners = [];
  if (preferred_provider_id) {
    const r = await supaFetch(`/rest/v1/partners?id=eq.${preferred_provider_id}&active=eq.true&select=id,company_name,contact_name,home_base_lat,home_base_lng,service_radius_km`);
    partners = await r.json();
  } else {
    const catFilter = service_type ? `&service_category=eq.${encodeURIComponent(service_type)}` : '';
    const r = await supaFetch(`/rest/v1/partners?active=eq.true${catFilter}&select=id,company_name,contact_name,home_base_lat,home_base_lng,service_radius_km`);
    partners = await r.json();
    // Filter by service radius using Haversine
    partners = partners.filter(p => {
      if (!p.home_base_lat || !p.home_base_lng) return true;
      return haversineKm(p.home_base_lat, p.home_base_lng, service_lat, service_lng) <= (p.service_radius_km || 30);
    });
  }

  if (!Array.isArray(partners) || !partners.length) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ windows: [], message: 'Ei saatavilla olevia tekijöitä alueellasi.' }) };
  }

  // 3. Cluster bonus
  let clusterMessage = null;
  if (cluster_bonus_enabled && postal_code) {
    const from = new Date(requested_date); from.setDate(from.getDate() - 7);
    const to   = new Date(requested_date); to.setDate(to.getDate() + 7);
    const r = await supaFetch(
      `/rest/v1/bookings?postal_code=eq.${encodeURIComponent(postal_code)}&scheduled_at=gte.${from.toISOString()}&scheduled_at=lte.${to.toISOString()}&status=neq.cancelled&select=id`
    );
    const d = await r.json();
    if (Array.isArray(d) && d.length > 0) {
      clusterMessage = 'Moni alueellasi varaa tällä viikolla — saat edullisemman hinnan!';
    }
  }

  // 4. Build windows per partner
  const allWindows = [];

  for (const partner of partners) {
    const dayStart = `${requested_date}T00:00:00`;
    const dayEnd   = `${requested_date}T23:59:59`;
    const bkRes = await supaFetch(
      `/rest/v1/bookings?provider_id=eq.${partner.id}&scheduled_at=gte.${dayStart}&scheduled_at=lte.${dayEnd}&status=neq.cancelled` +
      `&select=scheduled_at,service_lat,service_lng,estimated_duration_min&order=scheduled_at.asc`
    );
    const dayBookings = await bkRes.json();
    const bookings = Array.isArray(dayBookings) ? dayBookings : [];

    const homeLat = partner.home_base_lat || service_lat;
    const homeLng = partner.home_base_lng || service_lng;
    const providerName = partner.company_name || partner.contact_name || '—';

    // routing_sensitivity='low': skip insertion, return one full-day window
    if (routing_sensitivity === 'low') {
      allWindows.push({
        provider_id: partner.id, provider_name: providerName,
        window_start: `${requested_date}T08:00:00`,
        window_end:   `${requested_date}T18:00:00`,
        marginal_cost_km: 0,
        cluster_message: clusterMessage,
      });
      continue;
    }

    const slots = candidateSlots(requested_date, bookings, typical_duration_min);
    const route = bookings
      .filter(b => b.service_lat && b.service_lng)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    for (const slot of slots) {
      const ms = slot.start.getTime();
      const before = route.filter(b => new Date(b.scheduled_at).getTime() < ms);
      const after  = route.filter(b => new Date(b.scheduled_at).getTime() >= ms);
      const prev = before.length ? before[before.length - 1] : null;
      const next = after.length  ? after[0]                  : null;

      const prevLat = prev ? prev.service_lat : homeLat;
      const prevLng = prev ? prev.service_lng : homeLng;
      const nextLat = next ? next.service_lat : homeLat;
      const nextLng = next ? next.service_lng : homeLng;

      const cost = cheapestInsertionKm(service_lat, service_lng, prevLat, prevLng, nextLat, nextLng);

      allWindows.push({
        provider_id: partner.id, provider_name: providerName,
        window_start: slot.start.toISOString(),
        window_end:   slot.end.toISOString(),
        marginal_cost_km: Math.round(cost * 10) / 10,
        cluster_message: clusterMessage,
      });
    }
  }

  // 5. Sort by cheapest insertion (cluster bonus lowers effective cost by 5 km)
  allWindows.sort((a, b) => {
    const ca = a.marginal_cost_km - (a.cluster_message ? 5 : 0);
    const cb = b.marginal_cost_km - (b.cluster_message ? 5 : 0);
    if (Math.abs(ca - cb) > 0.1) return ca - cb;
    return new Date(a.window_start) - new Date(b.window_start);
  });

  return {
    statusCode: 200, headers: CORS,
    body: JSON.stringify({ windows: allWindows.slice(0, 20) }),
  };
};
