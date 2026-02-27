/**
 * validate(schema, source?)
 * source: 'body' (default) | 'query'
 *
 * Validates req.body or req.query against a Zod schema.
 * Replaces the source with the parsed + coerced data (e.g., converts "20" → 20 for numbers).
 */
function validate(schema, source = 'body') {
  return function (req, res, next) {
    const input = source === 'query' ? req.query : req.body;
    const result = schema.safeParse(input);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: result.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      });
    }
    // Write coerced + defaulted data back to the right source
    if (source === 'query') {
      req.query = result.data;
    } else {
      req.body = result.data;
    }
    next();
  };
}

module.exports = { validate };
