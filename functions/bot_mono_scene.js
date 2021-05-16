const firebase = require("firebase-admin");
const axios = require("axios");
const cc = require("currency-codes");

const {Scenes: {Stage, BaseScene}} = require("telegraf");
const {getMainKeyboard, getMonoKeyboard} = require("./bot_keyboards.js");

const {leave} = Stage;

const mono = new BaseScene("mono");

mono.enter((ctx) => {
  ctx.reply("Выберите валюту", getMonoKeyboard);
});

mono.leave((ctx) => {
  ctx.reply("Menu", getMainKeyboard);
});

mono.hears("USD", async (ctx) => ctx.reply( await getCurrency() ) );

mono.hears("where", (ctx) => ctx.reply("You are in mono scene"));

mono.hears("back", leave());

exports.mono = mono;

firebase.initializeApp();

async function updateData(currenciesFirestore) {
  try {
    // get data from monobank
    const currenciesMonobank = await axios.get("https://api.monobank.ua/bank/currency");

    const usdRate = currenciesMonobank.data.find((data) => {
      return data.currencyCodeA === Number(cc.code("USD").number);
    });

    const eurRate = currenciesMonobank.data.find((data) => {
      return data.currencyCodeA === Number(cc.code("EUR").number);
    });

    const rubRate = currenciesMonobank.data.find((data) => {
      return data.currencyCodeA === Number(cc.code("RUB").number);
    });

    // save data

    const dateUpdated = Math.floor(Date.now() / 1000);

    await firebase.firestore().doc("currencies/USD").set({data_updated: dateUpdated, ...usdRate});
    await firebase.firestore().doc("currencies/EUR").set({data_updated: dateUpdated, ...eurRate});
    await firebase.firestore().doc("currencies/RUB").set({data_updated: dateUpdated, ...rubRate});

    return {USD: usdRate, EUR: eurRate, RUB: rubRate};
  } catch (error) {
    // res.send(error.response.data.errorDescription);
    // if error return old data

    const currencyResult = {};

    currenciesFirestore.forEach((doc) => {
      currencyResult[doc.id] = doc.data();
    });

    return currencyResult;
  }
}

async function getCurrency() {
  const currenciesFirestore = await firebase.firestore().collection("currencies").get();

  let currencyResult = {};

  const dateTimestamp = Math.floor(Date.now() / 1000);

  currenciesFirestore.forEach((doc) => {
    const timeDiff = dateTimestamp - doc.data().data_updated;
    if (timeDiff < 60) {
      currencyResult[doc.id] = doc.data();
    }
  });
  // refresh data

  if ( Object.keys(currencyResult).length === 0 ) {
    currencyResult = await updateData(currenciesFirestore);
  }
  return currencyResult;
}
