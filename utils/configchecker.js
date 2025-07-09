// utils/configChecker.js
const logger = require('./logger');

function checkEnvVariables(requiredVars) {
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.error('Missing required environment variables:', { missingVars });
    process.exit(1);
  }
  
  logger.debug('All required environment variables are present');
}

module.exports = { checkEnvVariables };