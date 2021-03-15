const BigNumber = require('bignumber.js')

let shareTotal = 0;
let tvl = 0;

function deposit(amount) {
  let added = amount;

  if (tvl > 0) {
    added = BigNumber(amount).times(shareTotal).times(0.999).div(tvl);
  }
  shareTotal = BigNumber(shareTotal).plus(added);
  tvl = BigNumber(tvl).plus(amount);

  console.log(tvl.toString(), shareTotal.toString(), added.toString())
}

shareTotal = 100;
tvl = 100;
deposit(1000);

shareTotal = 10000;
tvl = 10000;
deposit(1000);

/*
for (let i = 0; i < 500; i++) {
  deposit(100)
}
*/
