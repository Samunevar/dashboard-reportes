const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const { shareUrl } = JSON.parse(event.body);
    if (!shareUrl) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta la URL' }) };

    const data = await new Promise((resolve, reject) => {
      https.get(shareUrl, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch(e) { reject(new Error('Respuesta no es JSON: ' + body.slice(0,100))); }
        });
      }).on('error', reject);
    });

    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
