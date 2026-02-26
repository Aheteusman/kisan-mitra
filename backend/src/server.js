const app = require('./app');
const { env } = require('./config/env');

app.listen(env.PORT, () => {
  console.log(`✅ Kisan Mitra API running on port ${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Health check: http://localhost:${env.PORT}/health`);
});
