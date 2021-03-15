import { memo, useMemo, useCallback, useState, useEffect } from "react";
import Web3 from "web3";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";
import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query'
import { BscConnector } from '@binance-chain/bsc-connector'

import Header from "./components/Header";
import bscWalletLogo from './assets/bscwallet.jpg'

import Main from "./Main/Main";
import ThemeContext, { setDocTheme, isStoreDarkMode } from './context/theme';

const queryClient = new QueryClient()

const bscProviderOptions = {
  display: {
    logo: bscWalletLogo,
    name: 'Binance Chain Wallet',
    description: 'Binance Smart Chain Wallet',
  },
  package: BscConnector,
  options: {
    supportedChainIds: [56],
  },
  connector: async (Package, opts) => {
    const bsc = new Package(opts)
    await bsc.activate()
    return bsc.getProvider()
  }
}

function initWeb3(provider) {
  const web3 = new Web3(provider);
  web3.eth.extend({
    methods: [
      {
        name: "chainId",
        call: "eth_chainId",
        outputFormatter: web3.utils.hexToNumber
      }
    ]
  });
  return web3;
}

const App = () => {
  // Dark theme
  const [theme, setTheme] = useState(isStoreDarkMode() ? 'dark' : 'light')
  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'light' ? 'dark' : 'light')
  }, [setTheme])
  const themeContextValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])
  useEffect(() => {
    setDocTheme(theme === 'dark')
  }, [theme])

  const [web3, setWeb3] = useState(null)
  const [connected, setConnected] = useState(false)
  const [connectionOK, setConnectionOK] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [address, setAddress] = useState(null)
  const [chain, setChain] = useState('heco')

  const providerOptions = useMemo(() => {
    return {
      'custom-bsc': bscProviderOptions,
      walletconnect: {
        package: WalletConnectProvider,
        options: {
          rpc:
          {
            56: "https://bsc-dataseed.binance.org/",
            128: "https://http-mainnet-node.huobichain.com/",
          },
        }
      },
    }
  }, [])

  const web3Modal = useMemo(() => new Web3Modal({
    network: 'binance',
    cacheProvider: true,
    providerOptions
  }), [providerOptions])

  const resetApp = useCallback(async () => {
    if (!web3) {
      return
    }
    if (web3 && web3.currentProvider && web3.currentProvider.close) {
      await web3.currentProvider.close()
    }
    await web3Modal.clearCachedProvider()
    setWeb3(null)
    setConnected(false)
    setConnectionOK(null)
    setChainId(null)
    setAddress(null)
  }, [web3, web3Modal])

  const subscribeProvider = useCallback(async (web3, provider) => {
    if (!provider.on) {
      return;
    }
    provider.on("accountsChanged", accounts => {
      setAddress(accounts[0])
      setConnectionOK(null)
    })
    provider.on("chainChanged", chainId => setChainId(
      web3.utils.hexToNumber(chainId)
    ))
  }, [])

//   const checkIfConnectionOK = useCallback(async (web3) => {
//     if (!web3 || !web3.eth) {
//       return false
//     }

//     const provider = await web3Modal.connect();
//     const networkId = await web3.eth.net.getId();
//     let providerInfo = getProviderInfo(provider);

//     let connectionOK = false
//     if (networkId === 56 || networkId === 128) {
//       connectionOK = true
//     }
//     if (providerInfo.check === "isWalletConnect") {
//       connectionOK = true
//     }
//     return connectionOK
//   }, [web3Modal])

  const onConnect = useCallback(async () => {
    const provider = await web3Modal.connect();

    const web3 = initWeb3(provider);
    await subscribeProvider(web3, provider);

    const accounts = await web3.eth.getAccounts();
    const address = accounts[0];
    const networkId = await web3.eth.net.getId();

    setWeb3(web3)
    setConnected(true)
    setConnectionOK(true)
    setChainId(networkId)
    setAddress(address)
  }, [subscribeProvider, web3Modal])

  useEffect(() => {
    if (web3Modal.cachedProvider) {
      if (!web3Modal.cachedProvider.includes('walletconnect')) {
        onConnect()
      } else {
        web3Modal.clearCachedProvider()
      }
    }
  }, [onConnect, web3Modal])

  const web3_np = useMemo(() => {
    if (!web3) {
      return null
    }
    const web3_np = new Web3(
      chainId === 56
        ? "https://bsc-dataseed.binance.org/"
        : "https://http-mainnet-node.huobichain.com"
    );
    web3_np.eth.extend({
      methods: [
        {
          name: "chainId",
          call: "eth_chainId",
          outputFormatter: web3_np.utils.hexToNumber
        }
      ]
    })
    return web3_np
  }, [web3, chainId])

  return (
    <ThemeContext.Provider value={themeContextValue}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <div className="relative min-h-screen">
            <Header
              onConnect={onConnect}
              connected={connected}
              connectionOK={connectionOK}
              address={address}
              resetApp={resetApp}
            />

            <Main
              connectionOK={connectionOK}
              connected={connected}
              chainId={chainId}
              address={address}
              web3={web3}
              web3_np={web3_np}
              chain={chain}
              setChain={setChain}
            />
          </div>
        </Router>
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}

export default memo(App);
