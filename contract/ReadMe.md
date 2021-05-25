## Getting Started

```
npm install
```

## Deploy

```
npx hardhat --network heco deploy
```

## Test

```
npx hardhat test
```

## Fork Heco mainnet
```
npx ganache-cli --fork https://http-mainnet-node.huobichain.com@3463152 --chainId 128
```

## YF Token

> 合约: [0x37cd594494bf81D438b92f89CaCb5eb7ef9242EC](http://hecoinfo.com/address/0x37cd594494bf81D438b92f89CaCb5eb7ef9242EC)

## YF Pool

> 合约: [0x78117e80A887e03C1F57B0975bC9a798Cc29eeF7](http://hecoinfo.com/address/0x78117e80A887e03C1F57B0975bC9a798Cc29eeF7)

## YF Strategies

> 合约: [0x7bf58f53692b1b12AdF8273E021B62FA6B7A3cB0](http://hecoinfo.com/address/0x7bf58f53692b1b12AdF8273E021B62FA6B7A3cB0)
> 合约: [0x6163F8c6eBFd8f218216dCB5d965407E77582563](http://hecoinfo.com/address/0x6163F8c6eBFd8f218216dCB5d965407E77582563)
> 合约: [0xe68aCB184B618DB561a9245A2dd18BB0304c7d62](http://hecoinfo.com/address/0xe68aCB184B618DB561a9245A2dd18BB0304c7d62)
> 合约: [0x792f5Ddb9CDE513448233B4fB6cEbac8818D96AE](http://hecoinfo.com/address/0x792f5Ddb9CDE513448233B4fB6cEbac8818D96AE)
> 合约: [0xd74EA1eb80D61c1bc81fFC8CD64181645d8F5bea](http://hecoinfo.com/address/0xd74EA1eb80D61c1bc81fFC8CD64181645d8F5bea)
> 合约: [0x0f7a94e9Ac9206E59F1139fDCbc4E82C7E814E5c](http://hecoinfo.com/address/0x0f7a94e9Ac9206E59F1139fDCbc4E82C7E814E5c)

```
93%给Vaults用户，其中45%复投、45%以挖矿对应平台的平台形式直接给用户、3%买成YF给用户（Vault里，LP池和单币池）；
3%以USDT的形式给质押YF-USDT LP凭证的用户（boardroom里，YF矿池）；
3%以USDT的形式留存（boardroom里，treasury）；
1%平台自留利润
```

## Audit FAQ

> LSB-02: Algorithm Not Robut

The formula implemented in `optimalDepositA()` is derived on the condition that the swapping fee rate is 0.003 which may not be the case when this contract is deployed. An alternative swapping fee other than 0.003 would render the algorithm erroneous. We would like to inquire about possible measures to ensure the calculation is sound?

```
  A: If the swapping fee changes, the algorithm will be replaced by deploying a new Stratx Contract, and the old Stratx Contract will be suspended, only withdrawals are allowed.

  答: 如果手续费变动，则会通过部署新的StratX contract 来替换算法, 旧StratX contract会被暂停,只允许提现
```

> SXB-07: Governor Capability

The governor has the capability to transfer 'earned' or 'desire' tokens to any address through `inCaseTokenGetStuck()`. While this capability offers a solution to the potential predicament the function name suggests, it could also be abused to enrich a selected few. This presents an issue we are concerned about and on which possible precautions we would like to inquire about.

```
  A: Because Stratx never holds any token capital, so inCaseTokenGetStuck is safe. It may be needed when there are computational precision rounding.

  答: 因为 StratX 从来不持有任何资金, 所以 inCaseTokensGetStuck 是安全的。当有计算精度舍入时可能会需要它。
```

## V2.0

```
费用分配，分farm-boo池，farm-mdx池，stake池三部分：
1，farm-boo池，即boo-usdt和boo-ht池，这两个池子挖出来的都是boo，挖出来的boo分配如下：
1%卖成USDT给平台手续费账户；
3%以BOO的形式给平台手续费账户（即，平台手续费账户一共拿4%，1%USDT+3%BOO）；
3%以BOO的形式给boardroom；
93%投入BOO单币池，挖出的BOO全部给用户；
Boo单币池的未领取收益全部再复投到BOO单币池;
BOO收益需要用户主动claim，减少claim次数;
即，这两个池子，存币用户拿走93%收益，全部是BOO没有YF，也没有任何收益分给share池。

2，farm-mdx池，即目前V1版本的池子，这些池子挖出来的都是MDX，挖出的MDX分配如下:
1%卖成USDT给平台手续费账户；
3%卖成USDT给boardroom；
3%没成USDT给share池用户；
93%给用户（其中3%卖成YF，45%以MDX形式给用户，45%复投以LP形式给用户）；
即，和目前保持一致，注意用户拿走自己所存部分收益的93%（YF部分是每个账户收益的3%换成YF给对应账户，不是在所有池子里平分）。

3，stake池，单币池，这些池子挖出来的是BOO+Filda或CAN，挖出来的BOO、filda、can分配如下：
filda和can全部卖成YF给用户；
BOO中，1%卖成USDT给平台手续费账户，3%以BOO的形式给平台手续费账户，3%以BOO的形式给boardroom，剩余全部给用户；
即，对于单币池，存币用户拿走约93%收益，收益为YF+BOO，没有任何收益分配给share池。和farm-boo池的区别在于这里多了一些filda和can，都换成了YF给用户。
```
