exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { token, dateFrom, dateTo } = JSON.parse(event.body);
    if (!token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el token' }) };

    // 1. Obtener todas las cuentas publicitarias
    const accountsUrl = `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name&limit=50&access_token=${token}`;
    const accountsResp = await fetch(accountsUrl);
    const accountsData = await accountsResp.json();
    if (accountsData.error) throw new Error(accountsData.error.message);

    const accounts = accountsData.data || [];
    if (accounts.length === 0) throw new Error('No se encontraron cuentas publicitarias');

    // 2. Consultar insights de todas las cuentas en paralelo
    const fields = 'campaign_name,spend,impressions,clicks,ctr,cpc';
    const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });

    const results = await Promise.all(accounts.map(async (account) => {
      try {
        const url = `https://graph.facebook.com/v19.0/${account.id}/insights?fields=${fields}&time_range=${timeRange}&level=campaign&limit=100&access_token=${token}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.error) return [];
        return (data.data || []).map(c => ({ ...c, account_name: account.name }));
      } catch {
        return [];
      }
    }));

    const allCampaigns = results.flat();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: allCampaigns, accounts: accounts.map(a => ({ id: a.id, name: a.name })) })
    };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
