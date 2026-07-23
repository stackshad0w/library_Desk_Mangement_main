const crypto = require('crypto');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
// Optional: puts every upload in its own folder, e.g. "swami-abhyasika"
const FOLDER = process.env.CLOUDINARY_FOLDER || '';

function configured() {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

// Uploads a base64 data URI (e.g. "data:image/jpeg;base64,...") and returns
// the hosted https URL. Uses a signed request so no "unsigned preset" needs
// to be configured on the Cloudinary account.
async function uploadDataUrl(dataUrl) {
  if (!configured()) {
    throw new Error('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)');
  }

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = FOLDER ? `folder=${FOLDER}&timestamp=${timestamp}` : `timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(paramsToSign + API_SECRET).digest('hex');

  const body = new URLSearchParams({
    file: dataUrl,
    api_key: API_KEY,
    timestamp: String(timestamp),
    signature,
  });
  if (FOLDER) body.set('folder', FOLDER);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `Cloudinary upload failed (${res.status})`);
  }
  return json.secure_url;
}

// Pulls the public_id back out of a secure_url returned by uploadDataUrl,
// e.g. "https://res.cloudinary.com/<cloud>/image/upload/v169.../swami-abhyasika/abc123.jpg"
// -> "swami-abhyasika/abc123". Returns null if the URL doesn't look like a
// Cloudinary delivery URL.
function extractPublicId(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?([^?#]+)\.[a-zA-Z0-9]+(?:[?#]|$)/);
  return match ? match[1] : null;
}

// Deletes an uploaded image from Cloudinary by its public_id. Safe to call
// with a public_id that no longer exists — Cloudinary just reports "not
// found" instead of erroring.
async function destroy(publicId) {
  if (!configured()) {
    throw new Error('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)');
  }

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(paramsToSign + API_SECRET).digest('hex');

  const body = new URLSearchParams({
    public_id: publicId,
    api_key: API_KEY,
    timestamp: String(timestamp),
    signature,
  });

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `Cloudinary delete failed (${res.status})`);
  }
  return json;
}

module.exports = { configured, uploadDataUrl, destroy, extractPublicId };
