import ERC20 from './abis/ERC20.json'
import AutoFarm from './abis/AutoFarm.json'
import constants from './constants'


export const getERC20TokenContract = (web3, web3_np) => (tokenAddress) => {
  tokenAddress = tokenAddress.toLowerCase()
  return {
    p: new web3.eth.Contract(ERC20.abi, tokenAddress, (error, result) => { if (error) console.log(error) }),
    np: new web3_np.eth.Contract(ERC20.abi, tokenAddress, (error, result) => { if (error) console.log(error) })
  }
}

export const getAutoFarmContract = (web3, web3_np, chain) => {
  // Refresh required if change from metamask to wallet connect since privider changed.
  let autoFarmContractAddress = constants.autoFarmV2ContractAddress[chain]
  return {
    p: new web3.eth.Contract(AutoFarm.abi, autoFarmContractAddress, (error, result) => { if (error) console.log(error) }),
    np: new web3_np.eth.Contract(AutoFarm.abi, autoFarmContractAddress, (error, result) => { if (error) console.log(error) }),
  }
}

