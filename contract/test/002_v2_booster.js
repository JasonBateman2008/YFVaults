const { expect } = require("chai");
const { get, execute, read, getArtifact } = deployments;

function mineBlock() {
  return network.provider.request({ method: 'evm_mine', params: []});
}

function fromWei(n) {
  return ethers.utils.formatUnits(n);
}

describe("V2 Pool Booster", () => {
  // 有钱人
  const richer1 = '0x67221451121647e46dC691d7F2188F4C10e868dD';
  const richer2 = '0xC9121e476155eBf0B794b7B351808af3787E727d';

  const fund100 = ethers.utils.parseUnits('100');
  const fund500 = ethers.utils.parseUnits('500');

  let BOO;
  let USDT;
  let V2POOL;

  beforeEach(async () => {
    await deployments.fixture();
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [ richer1 ]});
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [ richer2 ]});

    const signer1 = await ethers.getSigner(richer1);
    const signer2 = await ethers.getSigner(richer2);
    const [ faker0, faker1 ] = await ethers.getUnnamedSigners();

    const Pair = await getArtifact("contracts/mock/MockMdexPair.sol:MdexPair");
    const Pool = await get('YFHub');

    BOO    = await ethers.getContractAt(Pair.abi, '0xff96dccf2763D512B6038Dc60b7E96d1A9142507', signer1);
    USDT   = await ethers.getContractAt(Pair.abi, '0xa71EdC38d189767582C38A3145b5873052c3e47a', signer1);
    V2POOL = await ethers.getContractAt(Pool.abi, Pool.address, faker0);

    // faker0
    await BOO.transfer(faker0.address, fund500);
    await BOO.connect(faker0).approve(Pool.address, fund500);

    await USDT.transfer(faker0.address, fund500);
    await USDT.connect(faker0).approve(Pool.address, fund500);

    // faker1
    await BOO.transfer(faker1.address, fund500);
    await BOO.connect(faker1).approve(Pool.address, fund500);

    await USDT.transfer(faker1.address, fund500);
    await USDT.connect(faker1).approve(Pool.address, fund500);
  });

  it("Should it deposit USDT & BOO spell to USDT-BOO LP ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0 ] = await ethers.getUnnamedSigners();
    const options = { from: faker0.address };

    const strategy = await get('StratBooster');
    const usdt_boo = await read('YFHub', 'poolInfo', 0);
    const strat = await ethers.getContractAt(strategy.abi, usdt_boo.strat, governor);

    // USDT -> LP
    const interface = new ethers.utils.Interface(strategy.abi);
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', options, 'execute', 0, usdt);

    let wantLockedTotal = await strat.wantLockedTotal();
    let sharesTotal     = await strat.sharesTotal();
    let userShares      = await read('YFHub', 'userInfo', 0, faker0.address).then(({ shares }) => shares);
    let totalAmount     = await read('YFHub', 'poolInfo', 0).then(({ totalAmount }) => totalAmount);

    // 用户存款1
    console.log('  user deposit = %s lp', userShares);

    // BOO -> LP
    const boo = interface.encodeFunctionData('addLiquidityWERC20', [[ 0, fund100, 0, 0, 0 ]]);
    await execute('YFHub', options, 'execute', 0, boo);

    wantLockedTotal = await strat.wantLockedTotal();
    sharesTotal     = await strat.sharesTotal();
    userShares      = await read('YFHub', 'userInfo', 0, faker0.address).then(({ shares }) => shares);
    totalAmount     = await read('YFHub', 'poolInfo', 0).then(({ totalAmount }) => totalAmount);

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
      await strat.earn();

      const rewards = await V2POOL.pending(0, faker0.address);
      console.log('  user pending = %s\n', rewards.toString());
    }
  });

  it("Should it claim BOO rewards ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0 ] = await ethers.getUnnamedSigners();
    const options = { from: faker0.address };

    const strategy = await get('StratBooster');
    const usdt_boo = await read('YFHub', 'poolInfo', 0);
    const strat = await ethers.getContractAt(strategy.abi, usdt_boo.strat, governor);

    // USDT -> LP
    const interface = new ethers.utils.Interface(strategy.abi);
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', options, 'execute', 0, usdt);

    // 复投
    for (let i = 0; i < 2; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    await V2POOL.claim(0);
    const [ rewards ] = await V2POOL.pending(0, faker0.address);
    expect(rewards).to.equal(0);
  });

  it("Should it claim BOO rewards ok when multiple people", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0, faker1 ] = await ethers.getUnnamedSigners();

    const strategy = await get('StratBooster');
    const usdt_boo = await read('YFHub', 'poolInfo', 0);
    const strat = await ethers.getContractAt(strategy.abi, usdt_boo.strat, governor);
    const interface = new ethers.utils.Interface(strategy.abi);

    // faker0: USDT -> LP
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', { from: faker0.address }, 'execute', 0, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    // faker1: USDT -> LP
    await execute('YFHub', { from: faker1.address }, 'execute', 0, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    let rewards0 = await V2POOL.pending(0, faker0.address);
    let rewards1 = await V2POOL.pending(0, faker1.address);
    console.log('\nfaker0 rewards = %s', rewards0.toString());
    console.log('faker1 rewards = %s', rewards1.toString());

    await V2POOL.claim(0);

    rewards0 = await V2POOL.pending(0, faker0.address);
    rewards1 = await V2POOL.pending(0, faker1.address);
    console.log('faker0 rewards = %s', rewards0.toString());
    console.log('faker1 rewards = %s\n', rewards1.toString());

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    rewards0 = await V2POOL.pending(0, faker0.address);
    rewards1 = await V2POOL.pending(0, faker1.address);
    console.log('faker0 rewards = %s', rewards0.toString());
    console.log('faker1 rewards = %s', rewards1.toString());

    await V2POOL.claim(0);
    await V2POOL.connect(faker1).claim(0);

    rewards0 = await V2POOL.pending(0, faker0.address);
    rewards1 = await V2POOL.pending(0, faker1.address);
    console.log('faker0 rewards = %s', rewards0.toString());
    console.log('faker1 rewards = %s', rewards1.toString());
  });

  it("Should it calim BOO rewards ok after withdrawAll", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0, faker1 ] = await ethers.getUnnamedSigners();

    const strategy = await get('StratBooster');
    const usdt_boo = await read('YFHub', 'poolInfo', 0);
    const strat = await ethers.getContractAt(strategy.abi, usdt_boo.strat, governor);
    const interface = new ethers.utils.Interface(strategy.abi);

    // faker0: USDT -> LP
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', { from: faker0.address }, 'execute', 0, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    await execute('YFHub', { from: faker0.address }, 'withdrawAll', 0);
    let rewards0 = await V2POOL.pending(0, faker0.address);
    console.log('\nfaker0 rewards = %s', rewards0.toString());

    await V2POOL.claim(0);
    rewards0 = await V2POOL.pending(0, faker0.address);
    console.log('\nfaker0 rewards = %s', rewards0.toString());

    const info = await V2POOL.poolInfo(0);
    expect(info.totalAmount).to.equal(0);
  });

  it("Should it emergency withdraw ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0 ] = await ethers.getUnnamedSigners();

    const strategy = await get('StratBooster');
    const usdt_boo = await read('YFHub', 'poolInfo', 0);
    const strat = await ethers.getContractAt(strategy.abi, usdt_boo.strat, governor);
    const interface = new ethers.utils.Interface(strategy.abi);

    // faker0: USDT -> LP
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', { from: faker0.address }, 'execute', 0, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }
      await strat.earn();
    }

    await execute('YFHub', { from: faker0.address }, 'emergencyWithdraw', 0);
    let rewards0 = await V2POOL.pending(0, faker0.address);
    console.log('\nfaker0 rewards = %s', rewards0.toString());

    await V2POOL.claim(0);
    rewards0 = await V2POOL.pending(0, faker0.address);
    console.log('\nfaker0 rewards = %s', rewards0.toString());

    const info = await V2POOL.poolInfo(0);
    expect(info.totalAmount).to.equal(0);
  });

  it("Should it paused and unparsed ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const strategy = await get('StratBooster');
    const usdt_boo = await read('YFHub', 'poolInfo', 0);
    const strat = await ethers.getContractAt(strategy.abi, usdt_boo.strat, governor);

    await strat.pause();
    await strat.unpause();
  });

  it("Should it set params ok", async () => {
    const governor = await ethers.getNamedSigner('governor');
    const [ faker0 ] = await ethers.getUnnamedSigners();

    const strategy = await get('StratBooster');
    const usdt_boo = await read('YFHub', 'poolInfo', 0);
    const strat = await ethers.getContractAt(strategy.abi, usdt_boo.strat, governor);
    const interface = new ethers.utils.Interface(strategy.abi);

    // faker0: USDT -> LP
    const usdt = interface.encodeFunctionData('addLiquidityWERC20', [[ fund100, 0, 0, 0, 0 ]]);
    await execute('YFHub', { from: faker0.address }, 'execute', 0, usdt);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }

      const rewards = await V2POOL.pending(0, faker0.address);
      console.log('  before params updated, user pending = %s\n', rewards.toString());

      await strat.earn();
    }

    await strat.setControllerFee(0, 0, 0);

    // 复投
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        await mineBlock();
      }

      const rewards = await V2POOL.pending(0, faker0.address);
      console.log('  after params updated, user pending = %s\n', rewards.toString());

      await strat.earn();
    }

    await strat.setWithdrawFee(0);
    await execute('YFHub', { from: faker0.address }, 'withdrawAll', 0);
  });
});
