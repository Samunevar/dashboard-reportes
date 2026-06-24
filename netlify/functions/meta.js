exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const { token, dateFrom, dateTo } = JSON.parse(event.body);
    if (!token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el token' }) };

    const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
    const fields = 'campaign_name,spend,impressions,clicks,ctr,cpc';

    // 1. Obtener todas las cuentas
    const accsResp = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name&limit=50&access_token=${token}`
    );
    const accsData = await accsResp.json();
    if (accsData.error) throw new Error(accsData.error.message);
    const accounts = accsData.data || [];

    // 2. Consultar todas en paralelo con timeout individual de 8s
    const fetchWithTimeout = (url, ms=8000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), ms);
      return fetch(url, { signal: controller.signal })
        .then(r => { clearTimeout(id); return r; })
        .catch(() => null);
    };

    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const url = `https://graph.facebook.com/v19.0/${acc.id}/insights?fields=${fields}&time_range=${timeRange}&level=campaign&limit=100&access_token=${token}`;
        const resp = await fetchWithTimeout(url);
        if (!resp) return [];
        const data = await resp.json();
        if (data.error) return [];
        return (data.data || [])
          .filter(c => parseFloat(c.spend || 0) > 0)
          .map(c => ({ ...c, account_name: acc.name }));
      } catch { return []; }
    }));

    const allCampaigns = results.flat();

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        data: allCampaigns,
        accounts: accounts.map(a => ({ id: a.id, name: a.name }))
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
