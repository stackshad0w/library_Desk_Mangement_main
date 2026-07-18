const { requireAuth } = require('../../lib/auth');
const cloudinary = require('../../lib/cloudinary');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!requireAuth(req, res)) return;

  const { image } = req.body || {};
  if (typeof image !== 'string' || !image.startsWith('data:image')) {
    return res.status(400).json({ message: 'image must be a data:image/... base64 URI' });
  }

  if (!cloudinary.configured()) {
    // No Cloudinary credentials set — tell the caller so the client-side
    // shim can fall back to storing the original base64 value untouched.
    return res.status(503).json({ message: 'Cloudinary is not configured on the server' });
  }

  try {
    const url = await cloudinary.uploadDataUrl(image);
    res.json({ url });
  } catch (err) {
    res.status(502).json({ message: err.message || 'Upload failed' });
  }
};
