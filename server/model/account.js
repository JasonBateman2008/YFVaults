/**
 * 用户资产表
 */
const { Decimal } = require('decimal.js');
const { Op, fn, col } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  const { INTEGER, STRING, DECIMAL } = DataTypes;

  const Account = sequelize.define('account', {
    'tx_hash': {
      type: STRING
    },
    'block_number': {
      type: INTEGER,
      defaultValue: 0
    },
    'member': {
      type: STRING
    },
    'pool_address': {
      type: STRING
    },
    'pool_id': {
      type: INTEGER
    },
    'topic0': {
      type: STRING
    },
    'event': {
      type: STRING
    },
    'amount': {
      type: DECIMAL(40, 0),
      defaultValue: 0,
      get () {
        return Decimal(this.getDataValue('amount'));
      }
    }
  }, {
    indexes: [{
      unique: true,
      fields: [ 'tx_hash' ]
    }]
  });

  return Account;
};

