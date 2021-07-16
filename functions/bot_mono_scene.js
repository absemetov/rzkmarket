const firebase = require("firebase-admin");
const axios = require("axios");
const cc = require("currency-codes");
const {Scenes: {BaseScene}} = require("telegraf");
const {getMainKeyboard, getMonoKeyboard} = require("./bot_keyboards.js");
const {MenuTemplate, createBackMainMenuButtons} = require("telegraf-inline-menu");
const mono = new BaseScene("mono");

mono.enter((ctx) => {
  ctx.reply("Выберите валюту", getMonoKeyboard);
});

mono.leave((ctx) => {
  ctx.reply("Menu", getMainKeyboard);
});

mono.hears("where", (ctx) => ctx.reply("You are in mono scene"));

// test batch write
mono.hears("batch", async (ctx) => {
  const admin = firebase;
  const datas = [];
  for (let i=0; i < 1000; i++) {
    const data = {};
    for (let j=0; j < 10; j++) {
      const random = Math.random();
      if (random < 0.2) {
        data["field"+j] = "";
        for (let k=0; k < Math.random()*10; k++) {
          data["field"+j] += Math.random().toString(36).substring(2, 15)
          if (Math.random() < 0.5) data["field"+j] += " ";
        }
      } else if (random < 0.4) {
        data["field"+j] = Math.random()
      } else if (random < 0.6) {
        data["field"+j] = Math.round(Math.random() * 100000);
      } else if (random < 0.8) {
        data["field"+j] = Math.random() < 0.5;
      } else if (random < 0.9) {
        data["field"+j] = new Date(Math.random() * Date.now());
      } else {
        data["field"+j] = admin.firestore.FieldValue.serverTimestamp();
      }
    }
    datas.push(data);
  }
  // console.log(datas);
  const collection = admin.firestore().collection("58891568");
  console.log(`Testing performance of writing ${datas.length} documents...`);
  console.log(`There are now ${await getDocumentCount()} documents...\n`);
  let timestamp;
  timestamp = Date.now();
  await testSequentialIndividualWrites(JSON.parse(JSON.stringify(datas)));
  console.log(`sequential writes took ${Date.now() - timestamp} ms`);
  console.log(`There are now ${await getDocumentCount()} documents...\n`);
  timestamp = Date.now();
  await testBatchedWrites(JSON.parse(JSON.stringify(datas)));
  console.log(`Batched writes took ${Date.now() - timestamp} ms`);
  console.log(`There are now ${await getDocumentCount()} documents...\n`);
  timestamp = Date.now();
  await testParallelBatchedWrites(JSON.parse(JSON.stringify(datas)));
  console.log(`Parallel batched writes took ${Date.now() - timestamp} ms`);
  console.log(`There are now ${await getDocumentCount()} documents...\n`);
  timestamp = Date.now();
  await testParallelIndividualWrites(JSON.parse(JSON.stringify(datas)));
  console.log(`Parallel writes took ${Date.now() - timestamp} ms`);
  console.log(`There are now ${await getDocumentCount()} documents...\n`);
  async function testSequentialIndividualWrites(datas) {
    while (datas.length) {
      await collection.add(datas.shift());
    }
  }
  async function testBatchedWrites(datas) {
    let batch = admin.firestore().batch();
    let count = 0;
    while (datas.length) {
      batch.set(collection.doc(Math.random().toString(36).substring(2, 15)), datas.shift());
      if (++count >= 500 || !datas.length) {
        await batch.commit();
        batch = admin.firestore().batch();
        count = 0;
      }
    }
  }
  async function testParallelIndividualWrites(datas) {
    await Promise.all(datas.map((data) => collection.add(data)));
  }
  async function testParallelBatchedWrites(datas) {
    const batches = [];
    let batch = admin.firestore().batch();
    let count = 0;
    while (datas.length) {
      batch.set(collection.doc(Math.random().toString(36).substring(2, 15)), datas.shift());
      if (++count >= 500 || !datas.length) {
        batches.push(batch.commit());
        batch = admin.firestore().batch();
        count = 0;
      }
    }
    await Promise.all(batches);
  }
  async function getDocumentCount() {
    return (await collection.get()).size;
  }
});
// test batch write

mono.hears("back", (ctx) => ctx.scene.leave());

// listen all text messages
mono.on("text", async (ctx) => {
  const currencyObj = await getCurrency();
  const currency = currencyObj[ctx.message.text];
  if (currency) {
    ctx.replyWithMarkdown(monoMarkdown(currency));
  } else {
    ctx.replyWithMarkdown(`Currency *${ctx.message.text}* not found`);
  }
});

function monoMarkdown(currency) {
  const currencyCode = cc.number(currency.currencyCodeA).code;
  const date = new Date(currency.date*1000);
  const dateFormat = `${date.getDate()}/${(date.getMonth()+1)}/${date.getFullYear()}, `+
  `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  return `CURRENCY: *${currencyCode}*
RATE BUY: *${currency.rateBuy}*
RATE SELL: *${currency.rateSell}*
DATE:${dateFormat}`;
}

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

    await firebase.firestore().doc("currencies/USD").set({updatedAt: dateUpdated, ...usdRate});
    await firebase.firestore().doc("currencies/EUR").set({updatedAt: dateUpdated, ...eurRate});
    await firebase.firestore().doc("currencies/RUB").set({updatedAt: dateUpdated, ...rubRate});

    return {USD: usdRate, EUR: eurRate, RUB: rubRate};
  } catch (error) {
    // res.send(error.response.data.errorDescription);
    return {};
  }
}

async function getCurrency(currencyName) {
  const currenciesFirestore = await firebase.firestore().collection("currencies").get();

  let currencyResult = {};
  const currencyResultOld = {};
  const dateTimestamp = Math.floor(Date.now() / 1000);

  currenciesFirestore.forEach((doc) => {
    const timeDiff = dateTimestamp - doc.data().updatedAt;
    if (timeDiff < 3600) {
      currencyResult[doc.id] = doc.data();
    } else {
      currencyResultOld[doc.id] = doc.data();
    }
  });

  // if empty collection or old data
  if ( Object.keys(currencyResult).length === 0 ) {
    currencyResult = await updateData();
    // if an error in update
    if ( Object.keys(currencyResult).length === 0 ) {
      currencyResult = currencyResultOld;
    }
  }

  return currencyResult;
}

// menu
const menuMono = new MenuTemplate(() => "Выберите валюту");
const submenuTemplate = new MenuTemplate(async (ctx) => {
  const currencyObj = await getCurrency();
  const currency = currencyObj[ctx.match[1]];
  const text = monoMarkdown(currency);
  return {text, parse_mode: "Markdown"};
});
submenuTemplate.manualRow(createBackMainMenuButtons());
menuMono.chooseIntoSubmenu("currency", ["USD", "EUR", "RUB"], submenuTemplate);
menuMono.url("Monobank.com.ua", "https://monobank.com.ua");
menuMono.manualRow(createBackMainMenuButtons());
// menu

exports.mono = mono;
exports.menuMono = menuMono;

