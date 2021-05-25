const func = async ({ getNamedAccounts, deployments, network }) => {
  const { deploy, get, execute } = deployments;
  const { deployer, governor, custodian, boardroom } = await getNamedAccounts();

  const YF_Governor = '0x21043c5E2CAf31d2e3949554043f4E57b87189e8';

  const v2Pool = await get('YFHub');
  const v1Hub  = await get('StratHub');

  const MdexPair = await ethers.getContractFactory("contracts/mock/MockMdexPair.sol:MdexPair");

  // 获取 Heco LP 机枪池列表
  const HecoPool = await ethers.getContractFactory("HecoPool");
  const hecoPool = new ethers.Contract('0xFB03e11D93632D97a8981158A632Dd5986F5E909', HecoPool.interface, ethers.provider);

  // Mdex: Router
  const router = '0xED7d5F38C79115ca12fe6C0041abb22F0A06C300';
  const poolen = await hecoPool.poolLength().then(n => n.toNumber());
  const earned = await hecoPool.mdx();

  // ETH/USDT
  // 0x78C90d3f8A64474982417cDB490E840c01E516D4
  //
  // V2去掉: HUSD/USDT
  // 0xdff86B408284dff30A7CAD7688fEdB465734501C
  //
  // V2去掉: ETH/HBTC
  // 0x793c2a814e23EE38aB46412Be65E94Fe47D4B397
  //
  // MDX/USDT
  // 0x615E6285c5944540fd8bd921c9c8c56739Fd1E13
  //
  // MDX/WHT
  // 0x6Dd2993B50b365c707718b0807fC4e344c072eC2
  //
  // HPT/WHT
  // 0x401D97029e3EFaDD4245428A8E388f354Ee475af
  //
  // Filda/HUSD
  // 0x7964E55BBdAECdE48c2C8ef86E433eD47FEcB519
  //
  // CAN/MDX
  // 0xA4493e679Aec8Ec0F140D86900d982036F9e9Aa5
  //
  // SOVI/WHT
  // 0x16565e04813bd675A117ca87564480f1EA743E0D
  //
  // BOO/MDX
  // 0x6E9DBfab4D3623F529359921d16877D329183220
  //
  // WHT-WAR
  // 0xE4E55C9203Ac398A0F0B98BD096B70D9778eCa6A
  //
  // HUSD-DEP
  // 0xC95239fE2bAAbDbd15Eec26805156E219b12FfcE
  //
  // USDT-HOO
  // 0xc71c2B3E0634bFA0B89e287B466eEfF05c5b93D7
  const mdexLpList = [
    '0x78C90d3f8A64474982417cDB490E840c01E516D4',
    '0x615E6285c5944540fd8bd921c9c8c56739Fd1E13',
    '0x6Dd2993B50b365c707718b0807fC4e344c072eC2',
    '0x401D97029e3EFaDD4245428A8E388f354Ee475af',
    '0x7964E55BBdAECdE48c2C8ef86E433eD47FEcB519',
    '0xA4493e679Aec8Ec0F140D86900d982036F9e9Aa5',
    '0x16565e04813bd675A117ca87564480f1EA743E0D',
    '0x6E9DBfab4D3623F529359921d16877D329183220',
    '0xE4E55C9203Ac398A0F0B98BD096B70D9778eCa6A',
    '0xC95239fE2bAAbDbd15Eec26805156E219b12FfcE',
    '0xc71c2B3E0634bFA0B89e287B466eEfF05c5b93D7',
  ];

  for (let pid = 0; pid < poolen; pid++) {
    const poolInfo = await hecoPool.poolInfo(pid);
    const { lpToken } = poolInfo;

    // only LP token
    if (mdexLpList.includes(lpToken)) {
      const lpPair = new ethers.Contract(lpToken, MdexPair.interface, ethers.provider);
      const token0 = await lpPair.token0();
      const token1 = await lpPair.token1();

      const params = [
        v2Pool.address,
        hecoPool.address,
        pid,
        lpToken,
        token0,
        token1,
        earned,
        router,
        v1Hub.address
      ];

      // create strategy
      const strat = await deploy('StratMdex', {
        from: governor,
        args: params
      });

      // manual verify
      if (network.live) {
        console.log('    npx hardhat --network heco verify %s %s', strat.address, params.join(' '));
      }

      // YF 回购保管地址
      await execute(
        'StratMdex',
        { from: governor, gasLimit: 1000000 },
        'setFundsAccount',
        boardroom,
        custodian
      );

      if (network.live) {
        // 移交Governor
        await execute(
          'StratMdex',
          { from: governor },
          'setGov',
          YF_Governor
        );
      }

      // add to YF pool
      await execute('YFHub', { from: deployer }, 'add', lpToken, earned, strat.address);

      const pool_id = ('00' + pid).slice(-2);
      console.log('   add Mdex(pid = %s, lpToken = %s) to YFv2 %s Pool', pool_id, lpToken, strat.address);
    }
  }

  console.log('4. YFPool V2 Mdex strategies has deployed');
  return network.live;
};

func.id = 'deploy_v2_mdex';
module.exports = func;
