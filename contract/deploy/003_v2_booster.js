const func = async ({ getNamedAccounts, deployments, network }) => {
  const { deploy, get, execute } = deployments;
  const { deployer, governor, custodian, boardroom } = await getNamedAccounts();

  const YF_Governor = '0x21043c5E2CAf31d2e3949554043f4E57b87189e8';
  const WHT = '0x5545153CCFcA01fbd7Dd11C0b23ba694D9509A6F';
  const USDT = '0xa71EdC38d189767582C38A3145b5873052c3e47a';
  const BOO = '0xff96dccf2763D512B6038Dc60b7E96d1A9142507';
  const BOO_POOL = '0xBa92b862ac310D42A8a3DE613dcE917d0d63D98c';

  // Mdex: Router
  const router = '0xED7d5F38C79115ca12fe6C0041abb22F0A06C300';
  const v2Pool = await get('YFHub');

  const booLpList = [
    [ '0x57D38Bb09EA550B69E4a1416e05aB47a98aB7b1e', USDT, BOO, 5 ], // USDT-BOO LP
    [ '0xE837f5ca7c01335605704208A1575777292DB9B0', WHT,  BOO, 6 ]  // WHT-BOO LP
  ];

  for (const [ want, token0, token1, pid ] of booLpList) {
    const params = [
      v2Pool.address,
      BOO_POOL,
      pid,
      want,
      token0,
      token1,
      BOO,
      router
    ];

    // create strategy
    const strat = await deploy('StratBooster', {
      from: governor,
      args: params
    });

    // manual verify
    if (network.live) {
      console.log('    npx hardhat --network heco verify %s %s', strat.address, params.join(' '));
    }

    // YF 回购保管地址
    await execute(
      'StratBooster',
      { from: governor },
      'setFundsAccount',
      boardroom,
      custodian
    );

    if (network.live) {
      // 移交Governor
      await execute(
        'StratBooster',
        { from: governor },
        'setGov',
        YF_Governor
      );
    }

    // add to YF pool
    await execute('YFHub', { from: deployer }, 'add', want, BOO, strat.address);

    const pool_id = ('00' + pid).slice(-2);
    console.log('   add Booster(pid = %s, lpToken = %s) to YFv2 %s Pool', pool_id, want, strat.address);
  }

  console.log('3. YFPool V2 Booster strategies has deployed');
  return network.live;
};

func.id = 'deploy_v2_booster';
module.exports = func;
