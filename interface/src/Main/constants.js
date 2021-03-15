let mode = "prod"
// let mode = "dev" // same as prod, just using local server, not production.
// let mode = "test"

let serverURLBase =  "http://localhost:3888/"
let serverURLBase2 =  "http://localhost:3889/"
let serverURLBaseHeco =  "http://localhost:3889/"

const apiDomain = 'https://api.autofarm.network/'
const isStaging = process.env.REACT_APP_IS_STAGING

if (mode === "prod") {
  serverURLBase = "https://autofarm.network/api/"
  serverURLBase2 = apiDomain + (
    isStaging ? 'bsc-staging/' : 'bsc/'
  )
  serverURLBaseHeco = apiDomain + (
    isStaging ? 'heco-staging/' : 'heco/'
  )
}

module.exports = {
    mode,
    serverURLBase: serverURLBase,
    serverURLBase2: serverURLBase2,
    serverURLBaseHeco,
    autoFarmContractAddress : mode === "test" ? "0x17f619f4eec6742cEa2d287dbbcf61Ba3360172F" : "0x68Def7d5361350eBAc92d6b9fbE672b54D68e3d5",
    //mode == "test" ? "0x0df9c5fb57bc3b90e73563e9adb672bea2fd41fb"
    autoFarmV2ContractAddress: {
      bsc: "0x0895196562c7868c5be92459fae7f877ed450452",
      heco: "0xb09a88956730b6b842d9f1cf6f72dd682c2f36f9",
    },

    AUTOAddress: mode === "test" ? "0xD2653285774F448fD4A2E0A3F165C453ff848cEb": "0x4508ABB72232271e452258530D4Ed799C685eccb",
    AUTOv2Address: mode === "test" ? "0xD2653285774F448fD4A2E0A3F165C453ff848cEb": "0xa184088a740c695e156f91f5cc086a06bb78b827",

    gasLimit: "580000",
    blockExplorerURLBase: {
      bsc: "https://bscscan.com/",
      heco: "https://scan.huobichain.com/",
    }
}

