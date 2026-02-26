const cloudinary = require('cloudinary').v2;
const { env } = require('../config/env');

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary.
 * @param {Buffer} fileBuffer
 * @param {string} listingId
 * @returns {Promise<{ public_id: string, secure_url: string }>}
 */
function uploadListingImage(fileBuffer, listingId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `kisan-mitra/listings/${listingId}`,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ public_id: result.public_id, secure_url: result.secure_url });
      }
    );
    uploadStream.end(fileBuffer);
  });
}

module.exports = { uploadListingImage };