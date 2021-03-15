module.exports = {
  apps: [{
    name:      'defi-api',
    script:    './bin/www',
    time:      true,
    node_args: '-r dotenv/config'
  }, {
    name:      'defi-subscribe',
    script:    './bin/subscribe',
    time:      true,
    node_args: '-r dotenv/config'
  }]
};
