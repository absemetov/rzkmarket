const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const axios = require("axios");
const cc = require("currency-codes");

firebase.initializeApp();

async function updateData(currenciesFirestore) {
  try {
    //get data from monobank
    const currenciesMonobank = await axios.get("https://api.monobank.ua/bank/currency");

    const USD = currenciesMonobank.data.find((data) => {
      return data.currencyCodeA === Number(cc.code('USD').number);
    });

    const EUR = currenciesMonobank.data.find((data) => {
      return data.currencyCodeA === Number(cc.code('EUR').number);
    });

    const RUB = currenciesMonobank.data.find((data) => {
      return data.currencyCodeA === Number(cc.code('RUB').number);
    });

    //save data
    const dateUpdated = Math.floor(Date.now() / 1000);

    await firebase.firestore().doc('currencies/USD').set({data_updated: dateUpdated, ...USD});
    await firebase.firestore().doc('currencies/EUR').set({data_updated: dateUpdated, ...EUR});
    await firebase.firestore().doc('currencies/RUB').set({data_updated: dateUpdated, ...RUB});

    return {USD: USD, EUR: EUR, RUB: RUB};

  } catch(error) {
      //res.send(error.response.data.errorDescription);
      //if error return old data
      let currencyResult = {};

      currenciesFirestore.forEach(doc => {
        currencyResult[doc.id] = doc.data();
      });

      return currencyResult;
  }
}

exports.mono = async function() {

  const currenciesFirestore = await firebase.firestore().collection('currencies').get();

  let currencyResult = {};

  const date_timestamp  = Math.floor(Date.now() / 1000);

  currenciesFirestore.forEach(doc => {
    let timeDiff =  date_timestamp - doc.data().data_updated;
    if (timeDiff < 60) {
      currencyResult[doc.id] = doc.data();
    }
  });
  //if data not exist
  if ( Object.keys(currencyResult).length === 0 ) {
    currencyResult = await updateData(currenciesFirestore);
  }

  return currencyResult;
};
