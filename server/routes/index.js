const { Decimal } = require('decimal.js');
const { toChecksumAddress, isAddress } = require('web3-utils');
const { Op, fn, col } = require('sequelize');
const { Account } = require('../model');
const { factory, lpToken, pool } = require('../providers');

const express = require('express');
const router = express.Router();

router.get('/heco/get_stats', async (req, res) => {

});

router.get('/heco/get_farms_data', async (req, res) => {
  const len   = await pool.methods.poolLength().call().then(n => Number(n));
  const pools = {};
  const poolsDisplayOrder = [];
  const table_data = [];

  for (let i = 3; i < len; i++) {
    const pid = '' + i;
    const poolInfo = await pool.methods.poolInfo(i).call();
    const { want } = poolInfo;

    lpToken.options.address = want;
    const token0 = await lpToken.methods.token0().call();
    const token1 = await lpToken.methods.token1().call();

    lpToken.options.address = token0;
    const symbol0 = await lpToken.methods.symbol().call();
    lpToken.options.address = token1;
    const symbol1 = await lpToken.methods.symbol().call();

    const wantName = `${symbol0}-${symbol1} LP`;
    const totalAllocPoint = await pool.methods.totalAllocPoint().call();

    poolsDisplayOrder.push(pid);
    table_data.push([ pid, '.00x', wantName, 'MDEX', 6170059.898799511, '785.7']);

    pools[pid] = {
      "display": true,
      "stratType": "auto-compounding",
      "allowDeposits": true,
      "wantIsLP": true,
      "farmName": "MDEX",
      "wantName": wantName,
      "wantDecimals": 18,
      "wantLink": `https://info.mdex.com/#/pair/${want}`,
      "poolInfo": poolInfo,
      "totalAllocPoint": totalAllocPoint,
      "farmContractAddress": "0xFB03e11D93632D97a8981158A632Dd5986F5E909",
      "wantLockedTotal": "2705807044105437024281",
      "sharesTotal": "2258918440695644838893",
      "wantAddress": "0xFBe7b74623e4be82279027a286fa3A5b5280F77c",
      "earnedAddress": "0x25D2e80cB6B86881Fd7e07dd263Fb79f4AbE033c",
      "lastEarnBlock": "2941627",
      "farmPid": "8",
      "wantPrice": 484.49932030334287,
      "poolWantTVL": 1310961.6737410815,
      "farmWantLockedTotal": 690572.7610620533,
      "farmWantTVL": 334582033.3545676,
      "APR": 0.3671250488152464,
      "APY": 0.44298877327342906,
      "compoundsPerYear": 3246,
      "optimalBlocksToCompoundAfter": 3238.4473197781886,
      "APR_AUTO": 0,
      "APY_total": 0.44298877327342906
    };
  }

  res.json({ pools, poolsDisplayOrder, table_data });
});

router.get('/heco/principal', async (req, res) => {
  const { pid, user, valuts } = req.query;

  if (!isAddress(valuts)) {
    return res.status(400).json({ message: 'Invaild Pool address' });
  }

  const result = await Account.findAll({
    where: {
      'member': {
        [ Op.eq ]: user
      },
      'pool_id': {
        [ Op.eq ]: pid
      },
      'pool_address': {
        [ Op.eq ]: toChecksumAddress(address)
      }
    },
    attributes: [[ fn('sum', col('amount')), 'total_amount' ], 'event', 'pid' ],
    group: [ 'pid', 'event' ]
  }).catch(err => err);

  if (result instanceof Error) {
    return res.status(500).json({ message: result.message });
  }

  res.json({[ pid ]: result });
});

module.exports = router;
