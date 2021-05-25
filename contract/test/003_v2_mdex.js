const { expect } = require("chai");
const { get, execute, read, getArtifact } = deployments;

function mineBlock() {
  return network.provider.request({ method: 'evm_mine', params: []});
}

function fromWei(n) {
  return ethers.utils.formatUnits(n);
}

describe("V2 Pool Mdex", () => {
  let V2POOL;
  let USDT, ETH, HUSD, MDX, FILDA

  // 有钱人
  const richer0 = '0x67221451121647e46dC691d7F2188F4C10e868dD';
  const richer1 = '0xC9121e476155eBf0B794b7B351808af3787E727d';
  const richer2 = '0xCEE6de4290a4002DE8712D16f8CfBA03CB9aFCf4';

  const fund100 = ethers.utils.parseUnits('100');
  const fund500 = ethers.utils.parseUnits('500');
  const husd100 = ethers.utils.parseUnits('100', 8);

  beforeEach(async () => {
    await deployments.fixture();
    const deployer = await ethers.getNamedSigner('deployer');
    const [ user1, user2, user3, user4 ] = await ethers.getUnnamedSigners();

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
    const signer1 = await ethers.getSigner(richer1);
    const signer2 = await ethers.getSigner(richer2);

    // tranfer to deployer
    USDT = await ethers.getContractAt(Pair.abi, '0xa71EdC38d189767582C38A3145b5873052c3e47a', signer0);
    await USDT.transfer(deployer.address, fund500);
    await USDT.transfer(user1.address, fund500);
    await USDT.transfer(user2.address, fund500);
    await USDT.transfer(user3.address, fund500);
    await USDT.transfer(user4.address, fund500);
    await USDT.connect(deployer).approve(V2POOL.address, fund500);
    await USDT.connect(user1).approve(V2POOL.address, fund500);
    await USDT.connect(user2).approve(V2POOL.address, fund500);
    await USDT.connect(user3).approve(V2POOL.address, fund500);
    await USDT.connect(user4).approve(V2POOL.address, fund500);

    ETH = await ethers.getContractAt(Pair.abi, '0x64FF637fB478863B7468bc97D30a5bF3A428a1fD', signer1);
    await ETH.transfer(deployer.address, fund100);
    await ETH.transfer(user1.address, fund100);
    await ETH.transfer(user2.address, fund100);
    await ETH.transfer(user3.address, fund100);
    await ETH.transfer(user4.address, fund100);
    await ETH.connect(deployer).approve(V2POOL.address, fund100);
    await ETH.connect(user1).approve(V2POOL.address, fund100);
    await ETH.connect(user2).approve(V2POOL.address, fund100);
    await ETH.connect(user3).approve(V2POOL.address, fund100);
    await ETH.connect(user4).approve(V2POOL.address, fund100);

    MDX = await ethers.getContractAt(Pair.abi, '0x25D2e80cB6B86881Fd7e07dd263Fb79f4AbE033c', signer0);
    await MDX.transfer(deployer.address, fund500);
    await MDX.transfer(user1.address, fund500);
    await MDX.transfer(user2.address, fund500);
    await MDX.transfer(user3.address, fund500);
    await MDX.transfer(user4.address, fund500);
    await MDX.connect(deployer).approve(V2POOL.address, fund500);
    await MDX.connect(user1).approve(V2POOL.address, fund500);
    await MDX.connect(user2).approve(V2POOL.address, fund500);
    await MDX.connect(user3).approve(V2POOL.address, fund500);
    await MDX.connect(user4).approve(V2POOL.address, fund500);

    HUSD = await ethers.getContractAt(Pair.abi, '0x0298c2b32eaE4da002a15f36fdf7615BEa3DA047', signer2);
    await HUSD.transfer(deployer.address, husd100);
    await HUSD.transfer(user1.address, husd100);
    await HUSD.transfer(user2.address, husd100);
    await HUSD.transfer(user3.address, husd100);
    await HUSD.transfer(user4.address, husd100);
    await HUSD.connect(deployer).approve(V2POOL.address, husd100);
    await HUSD.connect(user1).approve(V2POOL.address, husd100);
    await HUSD.connect(user2).approve(V2POOL.address, husd100);
    await HUSD.connect(user3).approve(V2POOL.address, husd100);
    await HUSD.connect(user4).approve(V2POOL.address, husd100);

    FILDA = await ethers.getContractAt(Pair.abi, '0xE36FFD17B2661EB57144cEaEf942D95295E637F0', signer2);
    await FILDA.transfer(deployer.address, fund100);
    await FILDA.transfer(user1.address, fund100);
    await FILDA.transfer(user2.address, fund100);
    await FILDA.transfer(user3.address, fund100);
    await FILDA.transfer(user4.address, fund100);
    await FILDA.connect(deployer).approve(V2POOL.address, fund100);
    await FILDA.connect(user1).approve(V2POOL.address, fund100);
    await FILDA.connect(user2).approve(V2POOL.address, fund100);
    await FILDA.connect(user3).approve(V2POOL.address, fund100);
    await FILDA.connect(user4).approve(V2POOL.address, fund100);
    /*
     * ^^^ 把链上某些 token 转账到测试账户
     * |||
     */
  });

  it("Should it deposit MDX & USDT spell to MDX/USDT LP ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0 ] = await ethers.getUnnamedSigners();
    const options = { from: faker0.address };

    const Strategy = await get('StratMdex');
    const mdx_usdt = await read('YFHub', 'poolInfo', 3);
    const strat = await ethers.getContractAt(Strategy.abi, mdx_usdt.strat, governor);

    // USDT -> LP
    const interface = new ethers.utils.Interface(Strategy.abi);
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ 0, fund100, 0, 0, 0 ]]);
    await execute('YFHub', options, 'execute', 3, usdt);

    let wantLockedTotal = await strat.wantLockedTotal();
    let sharesTotal     = await strat.sharesTotal();
    let userShares      = await read('YFHub', 'userInfo', 3, faker0.address).then(({ shares }) => shares);
    let totalAmount     = await read('YFHub', 'poolInfo', 3).then(({ totalAmount }) => totalAmount);

    // 用户存款1
    console.log('  user deposit = %s lp', userShares);

    // MDX -> LP
    const mdx = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', options, 'execute', 3, mdx);

    wantLockedTotal = await strat.wantLockedTotal();
    sharesTotal     = await strat.sharesTotal();
    userShares      = await read('YFHub', 'userInfo', 3, faker0.address).then(({ shares }) => shares);
    totalAmount     = await read('YFHub', 'poolInfo', 3).then(({ totalAmount }) => totalAmount);

    expect(userShares).to.equal(sharesTotal);
    expect(sharesTotal).to.equal(wantLockedTotal);
    expect(totalAmount).to.equal(wantLockedTotal);

    // 用户存款2
    console.log('  user deposit = %s lp', userShares);

    // 复投 5 次
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }

      const rewards = await V2POOL.pending(3, faker0.address);
      console.log('  user pending = %s\n', rewards.toString());
      console.log('  wantLockedTotal = %s', await strat.wantLockedTotal());
      console.log('  sharesTotal = %s', await strat.sharesTotal());

      await strat.earn();
    }
  });

  it("Should it claim MDX & YF rewards ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0 ] = await ethers.getUnnamedSigners();
    const options = { from: faker0.address };

    const strategy = await get('StratMdex');
    const mdx_usdt = await read('YFHub', 'poolInfo', 4);
    const strat = await ethers.getContractAt(strategy.abi, mdx_usdt.strat, governor);

    // USDT -> LP
    const interface = new ethers.utils.Interface(strategy.abi);
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', options, 'execute', 4, usdt);

    // 复投
    for (let i = 0; i < 2; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    let [ mdx, yf ] = await V2POOL.pending(4, faker0.address);
    console.log('  before pending: mdx = %s, yf = %s', fromWei(mdx), fromWei(yf));

    await V2POOL.claim(4);
    [ mdx, yf ] = await V2POOL.pending(4, faker0.address);

    expect(mdx).to.equal(0);
    expect(yf).to.equal(0);
  });

  it("Should it claim MDX & YF rewards ok when multiple people", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0, faker1 ] = await ethers.getUnnamedSigners();

    const strategy = await get('StratMdex');
    const mdx_usdt = await read('YFHub', 'poolInfo', 4);
    const strat = await ethers.getContractAt(strategy.abi, mdx_usdt.strat, governor);
    const interface = new ethers.utils.Interface(strategy.abi);

    // faker0: USDT -> LP
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', { from: faker0.address }, 'execute', 4, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    // faker1: USDT -> LP
    await execute('YFHub', { from: faker1.address }, 'execute', 4, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    let [ mdx0, yf0 ] = await V2POOL.pending(4, faker0.address);
    let [ mdx1, yf1 ] = await V2POOL.pending(4, faker1.address);
    console.log('\n  faker0 pending: mdx = %s, yf = %s', fromWei(mdx0), fromWei(yf0));
    console.log('  faker1 pending: mdx = %s, yf = %s', fromWei(mdx1), fromWei(yf1));

    await V2POOL.claim(4);

    [ mdx0, yf0 ] = await V2POOL.pending(4, faker0.address);
    [ mdx1, yf1 ] = await V2POOL.pending(4, faker1.address);
    console.log('\n  faker0 pending: mdx = %s, yf = %s', fromWei(mdx0), fromWei(yf0));
    console.log('  faker1 pending: mdx = %s, yf = %s', fromWei(mdx1), fromWei(yf1));

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    [ mdx0, yf0 ] = await V2POOL.pending(4, faker0.address);
    [ mdx1, yf1 ] = await V2POOL.pending(4, faker1.address);
    console.log('\n  faker0 pending: mdx = %s, yf = %s', fromWei(mdx0), fromWei(yf0));
    console.log('  faker1 pending: mdx = %s, yf = %s', fromWei(mdx1), fromWei(yf1));

    await V2POOL.claim(4);
    await V2POOL.connect(faker1).claim(4);

    [ mdx0, yf0 ] = await V2POOL.pending(4, faker0.address);
    [ mdx1, yf1 ] = await V2POOL.pending(4, faker1.address);
    console.log('\n  faker0 pending: mdx = %s, yf = %s', fromWei(mdx0), fromWei(yf0));
    console.log('  faker1 pending: mdx = %s, yf = %s', fromWei(mdx1), fromWei(yf1));
  });

  it("Should it calim MDX & YF rewards ok after withdrawAll", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0 ] = await ethers.getUnnamedSigners();

    const strategy = await get('StratMdex');
    const mdx_usdt = await read('YFHub', 'poolInfo', 4);
    const strat = await ethers.getContractAt(strategy.abi, mdx_usdt.strat, governor);
    const interface = new ethers.utils.Interface(strategy.abi);

    // faker0: USDT -> LP
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', { from: faker0.address }, 'execute', 4, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    await execute('YFHub', { from: faker0.address }, 'withdrawAll', 4);
    let [ mdx0, yf0 ] = await V2POOL.pending(4, faker0.address);
    console.log('\n  faker0 pending: mdx = %s, yf = %s', fromWei(mdx0), fromWei(yf0));

    await V2POOL.claim(4);

    [ mdx0, yf0 ] = await V2POOL.pending(4, faker0.address);
    console.log('\n  faker0 pending: mdx = %s, yf = %s', fromWei(mdx0), fromWei(yf0));

    await V2POOL.claimAll();

    const info = await V2POOL.poolInfo(4);
    expect(info.totalAmount).to.equal(0);
  });

  it("Should it emergency withdraw ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0 ] = await ethers.getUnnamedSigners();

    const strategy = await get('StratMdex');
    const mdx_usdt = await read('YFHub', 'poolInfo', 4);
    const strat = await ethers.getContractAt(strategy.abi, mdx_usdt.strat, governor);
    const interface = new ethers.utils.Interface(strategy.abi);

    // faker0: USDT -> LP
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', { from: faker0.address }, 'execute', 4, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    await execute('YFHub', { from: faker0.address }, 'emergencyWithdraw', 4);
    let rewards0 = await V2POOL.pending(4, faker0.address);
    console.log('\nfaker0 rewards = %s', rewards0.toString());

    await V2POOL.claim(4);
    rewards0 = await V2POOL.pending(4, faker0.address);
    console.log('\nfaker0 rewards = %s', rewards0.toString());

    const info = await V2POOL.poolInfo(4);
    expect(info.totalAmount).to.equal(0);
  });

  it("Should it paused and unparsed ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const strategy = await get('StratMdex');
    const mdx_usdt = await read('YFHub', 'poolInfo', 4);
    const strat = await ethers.getContractAt(strategy.abi, mdx_usdt.strat, governor);

    await strat.pause();
    await strat.unpause();
  });

  it("Should it set params ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0 ] = await ethers.getUnnamedSigners();

    const strategy = await get('StratMdex');
    const mdx_usdt = await read('YFHub', 'poolInfo', 4);
    const strat = await ethers.getContractAt(strategy.abi, mdx_usdt.strat, governor);
    const interface = new ethers.utils.Interface(strategy.abi);

    // faker0: USDT -> LP
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', { from: faker0.address }, 'execute', 4, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }

      const rewards = await V2POOL.pending(4, faker0.address);
      console.log('  before params updated, user pending = %s\n', rewards.toString());

      await strat.earn();
    }

    await strat.setControllerFee(0, 0, 0);
    await strat.setRepurchaseRate(0);
    await strat.setReinvestedRate(0);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }

      const rewards = await V2POOL.pending(4, faker0.address);
      console.log('  after params updated, user pending = %s\n', rewards.toString());

      await strat.earn();
    }

    await strat.setWithdrawFee(0);
    await execute('YFHub', { from: faker0.address }, 'withdrawAll', 4);
  });
});
