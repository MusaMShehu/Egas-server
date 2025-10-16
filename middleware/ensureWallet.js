const Wallet = require('../models/wallet');

exports.ensureWallet = async function (req, res, next) {
  const userId = req.user.id;
  let wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    wallet = await Wallet.create({ userId, balance: 0, transactions: [] });
  }

  req.wallet = wallet;
  next();
};
