'use strict';

// electron-builder config files must contain ONLY build schema properties.
// Extending ./package.json directly incorrectly exposes name/version/main/etc
// as unknown electron-builder configuration keys.
const { build } = require('./package.json');

module.exports = {
  ...build,
  publish: [{
    provider: 'github',
    owner: 'Nan1233',
    repo: 'worker-management-system',
    channel: 'beta'
  }]
};
