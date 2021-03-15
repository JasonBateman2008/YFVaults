// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// const hre = require("hardhat");
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

async function main() {
  const [ devAccount ] = await ethers.getSigners();

  const Timelock = await ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(devAccount.address);

  await timelock.deployed();
  const govAddress = timelock.address;

  const YFToken = await ethers.getContractFactory("YFToken");
  const YF = await YFToken.deploy();

  await YF.deployed();
  console.log("YF token deployed to:", YF.address);

  const YFVaults = await ethers.getContractFactory("YFVaults");
  const YFPool = await YFVaults.deploy(YF.address);

  await YFPool.deployed();
  console.log("YFVaults deployed to:", YFPool.address);

  // Transfer pool owner to Timelock
  await YFPool.transferOwnership(govAddress);

  // First strategy is `MUST` YF-USDT
  const StrategyX = await ethers.getContractFactory("StratHecoPool");

  // e.g. ETH-USDT, TODO: YF-USDT
  const strategy0 = await StrategyX.deploy(
    false,          // _isAutoComp
    govAddress,     // _govAddress
    YFPool.address, // _YFVAddress
    YF.address,     // _YFTokenAddress
    0,              // _pid: source farms id

    '0x0000000000000000000000000000000000000000', // _lpPoolAddress
    '0x78c90d3f8a64474982417cdb490e840c01e516d4', // _lpToken
    '0x64ff637fb478863b7468bc97d30a5bf3a428a1fd', // _token0Address
    '0xa71edc38d189767582c38a3145b5873052c3e47a', // _token1Address
    '0x000000000000000000000000000000000000dEaD', // _earnedAddress
    '0x000000000000000000000000000000000000dEaD', // _router
    '0x000000000000000000000000000000000000dEaD'  // _factory
  );

  await strategy0.deployed();

  // push to pool
  await timelock.add(
    YFPool.address,
    '0x78c90d3f8a64474982417cdb490e840c01e516d4', // _want: lpToken
    true,                                         // _withUpdate
    strategy0.address                             // _strat
  );

  // staked strategy
  const salt0 = '0x' + Buffer.alloc(32).toString('hex');
  await timelock.scheduleSet(YFPool.address, 0, 300, true, salt0, salt0);

  // DEV: Fake time elapsed
  if (ethers.provider.network.chainId === 31337) {
    for (let i = 0; i < 30; i++) {
      const f = await YFToken.deploy();
      await f.deployed();
      console.log('block height = %s', await ethers.provider.getBlockNumber());
    }
  }

  await timelock.executeSet(YFPool.address, 0, 300, true, salt0, salt0);

  // TODO: add lp pool
  //

  console.log('YFVaults pool lenght = %s', await YFPool.poolLength());
  console.log('YFVaults pool info 0 = %o', await YFPool.poolInfo(0));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
