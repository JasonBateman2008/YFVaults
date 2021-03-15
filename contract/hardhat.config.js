require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");

task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("autofarm", "Prints AUTO price on bsc", async () => {
  const AutoFarm = await ethers.getContractFactory("PancakePair");

  // WBNB-AUTO
  const autopair = new ethers.Contract('0x4d0228EBEB39f6d2f29bA528e2d15Fc9121Ead56', AutoFarm.interface, ethers.provider);

  // BUSD-WBNB
  const basepair = new ethers.Contract('0x1B96B92314C44b159149f7E0303511fB2Fc4774f', AutoFarm.interface, ethers.provider);

  const [ r0, r1 ] = await autopair.getReserves();
  const [ r2, r3 ] = await basepair.getReserves();

  const p = r1.mul(1e12).div(r0);
  console.log('AUTO price = %s', ethers.utils.formatUnits(p.mul(r3).div(r2), 12));
});

task("hecopool", "Debug the HecoPool", async () => {
  const HecoPool = await ethers.getContractFactory("HecoPool");
  const hecoPool = new ethers.Contract('0xFB03e11D93632D97a8981158A632Dd5986F5E909', HecoPool.interface, ethers.provider);

  const MdexPair = await ethers.getContractFactory("MdexPair");
  const poolLength = await hecoPool.poolLength().then(n => n.toNumber());

  for (let i = 0; i < poolLength; i++) {
    const poolInfo = await hecoPool.poolInfo(i);
    const { allocPoint, lpToken } = poolInfo;

    console.log('[HecoPool] pid = %s, info = %o', i, poolInfo);

    if (allocPoint.gt(0)) {
      const hmdx = new ethers.Contract(lpToken, MdexPair.interface, ethers.provider);

      console.log('[MdexPair] factory = %s', await hmdx.factory());
      console.log('[MdexPair]  token0 = %s', await hmdx.token0());
      console.log('[MdexPair]  token1 = %s', await hmdx.token1());
    }
  }
});

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    hardhat: {
      gas: 'auto',
      gasPrice: 'auto',
      forking: {
        url: 'https://http-mainnet.hecochain.com',
        enabled: true
      }
    },
    bsc: {
      url: 'https://bsc-dataseed1.ninicoin.io'
    }
  },
  solidity: {
    compilers: [{
      version: "0.6.12",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }, {
      version: "0.6.6",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }, {
      version: "0.5.16",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }],
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};

