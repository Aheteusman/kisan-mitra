const axios = require('axios');
const { env } = require('../config/env');

let aiAxios = null;

function getClient() {
  if (!env.AI_SERVICE_URL) return null;
  if (!aiAxios) {
    aiAxios = axios.create({
      baseURL: env.AI_SERVICE_URL,
      timeout: 8000,
    });
  }
  return aiAxios;
}

/**
 * Get price advice for a crop.
 * @param {{ crop_type: string, quantity_kg: number, location: string }} params
 * @returns {Promise<{ ai_predicted_price: number, mandi_reference_price: number } | null>}
 */
async function getPriceAdvice({ crop_type, quantity_kg, location }) {
  const client = getClient();
  if (!client) return null;
  try {
    const { data } = await client.post('/api/ai/price-advice', {
      crop_type,
      quantity_kg,
      location,
    });
    return data;
  } catch {
    return null;
  }
}

/**
 * Get market overview for a region.
 * @param {{ region: string }} params
 * @returns {Promise<Array<{ crop: string, ai_price: number, mandi_price: number, trend_pct: number, demand_level: string }>>}
 */
async function getMarketOverview({ region }) {
  const client = getClient();
  if (!client) return [];
  try {
    const { data } = await client.get('/api/ai/market-overview', {
      params: { region },
    });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Validate listing images against declared grade.
 * @param {{ image_urls: string[], declared_grade: string }} params
 * @returns {Promise<{ valid: boolean, predicted_grade: string, mismatch: boolean } | null>}
 */
async function validateImages({ image_urls, declared_grade }) {
  const client = getClient();
  if (!client) return null;
  try {
    const { data } = await client.post('/api/ai/validate-images', {
      image_urls,
      declared_grade,
    });
    return data;
  } catch {
    return null;
  }
}

module.exports = { getPriceAdvice, getMarketOverview, validateImages };