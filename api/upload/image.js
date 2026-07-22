const { requireAuth } = require('../../lib/auth');
const cloudinary = require('../../lib/cloudinary');

const MAX_IMAGE_BYTES = 250 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!requireAuth(req, res)) return;

  const { image } = req.body || {};
  const match = typeof image === 'string'
    ? image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i)
    : null;

  if (!match || !ALLOWED_TYPES.has(match[1].toLowerCase())) {
    return res.status(400).json({ message: 'Please upload a valid JPG, PNG or WEBP image.' });
  }

  const base64 = match[2].replace(/\s/g, '');
  const padding = (base64.match(/=*$/) || [''])[0].length;
  const estimatedBytes = Math.floor((base64.length * 3) / 4) - padding;

  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({
      message: 'Image is larger than 250 KB. Please let the app compress it and try again.'
    });
  }

  if (!cloudinary.configured()) {
    return res.status(503).json({ message: 'Image storage is temporarily unavailable.' });
  }

  try {
    const url = await cloudinary.uploadDataUrl(image);
    return res.json({ url });
  } catch (err) {
    console.error('Cloudinary image upload failed:', err);
    return res.status(502).json({ message: 'Image upload failed. Please try again.' });
  }
};
