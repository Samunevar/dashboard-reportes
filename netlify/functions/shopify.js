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
    const { token, store, dateFrom, dateTo } = JSON.parse(event.body);

    if (!token || !store || !dateFrom || !dateTo) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan parámetros' }) };
    }

    const url = `https://${store}/admin/api/2024-01/orders.json?status=any&created_at_min=${dateFrom}T00:00:00-05:00&created_at_max=${dateTo}T23:59:59-05:00&limit=250&fields=id,name,email,total_price,financial_status,fulfillment_status,created_at,customer`;

    const resp = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: `Shopify error ${resp.status}: ${text}` }) };
    }

    const data = await resp.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
