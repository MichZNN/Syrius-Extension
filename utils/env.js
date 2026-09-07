/**
 * Resolve environment values shared by the Webpack configuration and the
 * local development server. Shell-provided values take precedence.
 */
module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
};
