const func = async ({ getNamedAccounts, deployments, network }) => {
  const { AddressZero } = ethers.constants;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const ADD_ABI = [{
    "inputs":[
      {"internalType":"bool","name":"_withUpdate","type":"bool"},
      {"internalType":"uint256","name":"_allocYPoint","type":"uint256"},
      {"internalType":"uint256","name":"_allocUPoint","type":"uint256"},
      {"internalType":"uint256","name":"_allocBPoint","type":"uint256"},
      {"internalType":"address","name":"_want","type":"address"},
      {"internalType":"address","name":"_earned","type":"address"},
      {"internalType":"contract IStrategy","name":"_strat","type":"address"}
    ],
    "name":"add",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"}
  ];

  const POOL_V1 = '0x21C055c4ac759E84609666af2Df61Ca65a5c1168';
  const USDT = '0xa71EdC38d189767582C38A3145b5873052c3e47a';

  const hub = await deploy('StratHub', {
    from: deployer,
    args: [ POOL_V1, USDT ]
  });

  let signer = '0x1aA433354384bAafd9d180CC0aaCa65725249d79'
  if (network.live) {
    signer = await ethers.getNamedSigner('deployer');
  } else {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [ signer ]});
    signer = await ethers.getSigner(signer);
  }

  const pool = await ethers.getContractAt(ADD_ABI, POOL_V1, signer);
  await pool.add(false, 0, 0, 0, AddressZero, AddressZero, hub.address);

  console.log('1. V1 startegy hub has deployed');
  return network.live;
};

func.id = 'deploy_pool_v1_hub';
module.exports = func;
