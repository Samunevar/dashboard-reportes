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
    const { apiKey, reportId, dateFrom, dateTo } = JSON.parse(event.body);

    if (!apiKey || !reportId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan parámetros' }) };
    }

    const params = new URLSearchParams({
      'filters[orders.processed_at][gte]': dateFrom + 'T00:00:00',
      'filters[orders.processed_at][lte]': dateTo + 'T23:59:59',
      'format': 'json',
      'limit': '5000'
    });

   const url = `https://app.mipler.com/api/v1/reports/${reportId}/export?format=json&${params}`;

    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: `Mipler error ${resp.status}: ${text}` }) };
    }

    const data = await resp.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
