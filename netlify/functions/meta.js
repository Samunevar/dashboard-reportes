Pega este código en el área de texto:
javascriptexports.handler = async (event) => {
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
    const { token, adAccount, dateFrom, dateTo } = JSON.parse(event.body);

    if (!token || !adAccount || !dateFrom || !dateTo) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan parámetros' }) };
    }

    const fields = 'campaign_name,spend,impressions,clicks,ctr,cpc';
    const url = `https://graph.facebook.com/v19.0/${adAccount}/insights?fields=${fields}&time_range={"since":"${dateFrom}","until":"${dateTo}"}&level=campaign&limit=50&access_token=${token}`;

    const resp = await fetch(url);
    const data = await resp.json();

    if (data.error) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: data.error.message }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
