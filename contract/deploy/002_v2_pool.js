const func = async ({ getNamedAccounts, deployments, network }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const options = { from: deployer };
  const blockNumber = await ethers.provider.getBlockNumber();

  await deploy('YFHub', { ...options, args: [ blockNumber ]});

  console.log('2. YFHub has deployed');
  return network.live;
};

func.id = 'deploy_pool_v2';
module.exports = func;
