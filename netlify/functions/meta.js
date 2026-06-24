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

    // 1. Obtener cuentas
    const accsResp = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${token}`);
    const accsData = await accsResp.json();
    if (accsData.error) throw new Error(accsData.error.message);

    // Solo cuentas activas (status=1)
    const accounts = (accsData.data || []).filter(a => a.account_status === 1 || a.account_status === undefined);
    if (accounts.length === 0) throw new Error('No se encontraron cuentas publicitarias activas');

    // 2. Consultar en lotes de 4 para evitar timeout
    const fields = 'campaign_name,spend,impressions,clicks,ctr,cpc';
    const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
    const allCampaigns = [];

    // Lotes de 4
    for (let i = 0; i < accounts.length; i += 4) {
      const batch = accounts.slice(i, i + 4);
      const results = await Promise.all(batch.map(async (acc) => {
        try {
          const url = `https://graph.facebook.com/v19.0/${acc.id}/insights?fields=${fields}&time_range=${timeRange}&level=campaign&limit=50&access_token=${token}`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.error) return [];
          return (data.data || [])
            .filter(c => parseFloat(c.spend || 0) > 0)
            .map(c => ({ ...c, account_name: acc.name }));
        } catch { return []; }
      }));
      results.forEach(r => allCampaigns.push(...r));
    }

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
