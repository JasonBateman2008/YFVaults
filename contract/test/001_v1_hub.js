const { expect } = require("chai");
const { get, execute, read, getArtifact } = deployments;

function mineBlock() {
  return network.provider.request({ method: 'evm_mine', params: []});
}

function fromWei(n) {
  return ethers.utils.formatUnits(n);
}

describe("V1 Strategy Hub", () => {
  let V2POOL;
  let USDT;

  // 有钱人
  const richer0 = '0x67221451121647e46dC691d7F2188F4C10e868dD';
  const richer1 = '0xC9121e476155eBf0B794b7B351808af3787E727d';
  const richer2 = '0xCEE6de4290a4002DE8712D16f8CfBA03CB9aFCf4';

  const fund500 = ethers.utils.parseUnits('500');

  beforeEach(async () => {
    await deployments.fixture();
    const deployer = await ethers.getNamedSigner('deployer');
    const [ user1 ] = await ethers.getUnnamedSigners();

    const Pair = await getArtifact("contracts/mock/MockMdexPair.sol:MdexPair");
    const Pool = await get('YFHub');

    // Export variables
    V2POOL = await ethers.getContractAt(Pool.abi, Pool.address, user1);

    /*
     * |||
     * vvv 把链上某些 token 转账到测试账户
     */

    // Impersonating accounts: ETH, USDT, MDX, HUSD richer
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [ richer0 ]});
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [ richer1 ]});
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [ richer2 ]});
    const signer0 = await ethers.getSigner(richer0);

    // tranfer to deployer
    USDT = await ethers.getContractAt(Pair.abi, '0xa71EdC38d189767582C38A3145b5873052c3e47a', signer0);
    await USDT.transfer(deployer.address, fund500);
  });


  it("Should it transit ok", async () => {
    const deployer = await ethers.getNamedSigner('deployer');
    const Hub = await get('StratHub');
    const hub = await ethers.getContractAt(Hub.abi, Hub.address, deployer);

    await USDT.connect(deployer).transfer(hub.address, fund500);
    await hub.transit();
  });
});
