// functions/emailHttpTriggerBooking/index.js
const https = require("https");
const { createJsonResponse } = require("../shared/http");

module.exports = async function (context, req) {
  context.log("Kjører emailHttpTriggerBooking...");

  if (req.method === "OPTIONS") {
    return createJsonResponse(204);
  }

  const body = req.body || {};
  const defaultToAddress =
    (process.env.BOARD_TO_ADDRESS && process.env.BOARD_TO_ADDRESS.trim()) ||
    (process.env.DEFAULT_TO_ADDRESS && process.env.DEFAULT_TO_ADDRESS.trim()) ||
    "helgoens.vel@example.com";

  const to = (body.to && String(body.to).trim()) || defaultToAddress;
  const subject = body.subject || "Plunk test";
  const html = body.html || `<p>Hei fra Azure Function via Plunk!</p>`;
  const text = body.text || "Hei fra Azure Function via Plunk!";

  if (!to) {
    context.log.warn('Missing "to" address.');
    return createJsonResponse(400, { error: 'Missing "to" field.' });
  }

  if (!process.env.PLUNK_API_TOKEN) {
    context.log.error("PLUNK_API_TOKEN mangler i miljøvariabler.");
    return createJsonResponse(500, { error: "PLUNK_API_TOKEN ikke satt." });
  }

  // Gjør HTTPS-kall mot Plunk API manuelt (uten fetch)
  const payload = JSON.stringify({
    to,
    subject,
    body: html || text
  });

  const options = {
    hostname: "api.useplunk.com",
    path: "/v1/send",
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.PLUNK_API_TOKEN}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  };

  const result = await new Promise((resolve, reject) => {
    const reqHttps = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data || "{}"));
          } catch {
            resolve({ raw: data });
          }
        } else {
          reject(
            new Error(`Plunk API-feil: ${res.statusCode} ${data}`)
          );
        }
      });
    });

    reqHttps.on("error", reject);
    reqHttps.write(payload);
    reqHttps.end();
  });

  context.log("E-post sendt OK:", result);
  return createJsonResponse(202, { success: true, response: result });
};
