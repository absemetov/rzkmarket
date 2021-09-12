const firebase = require("firebase-admin");
const axios = require("axios");
const cc = require("currency-codes");
const {Scenes: {BaseScene}} = require("telegraf");
// const {getMainKeyboard, getMonoKeyboard} = require("./bot_keyboards.js");
// const {MenuTemplate, createBackMainMenuButtons} = require("telegraf-inline-menu");
const monoScene = new BaseScene("monoScene");

monoScene.use(async (ctx, next) => {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    console.log("mono scene another callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
  }
  return next();
});

monoScene.enter((ctx) => {
  ctx.reply("Выберите валюту", {
    reply_markup: {
      inline_keyboard: [
        [
          {text: "USD", callback_data: "mono/USD"},
          {text: "EUR", callback_data: "mono/EUR"},
          {text: "RUB", callback_data: "mono/RUB"},
        ],
        [
          {text: "Monobank.com.ua", url: "https://monobank.com.ua"},
        ],
      ],
      // resize_keyboard: true,
    }});
});

// Currency controller
monoScene.action(/^mono\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  const currencyName = ctx.match[1];
  const currencyObj = await getCurrency();
  await ctx.editMessageText(monoMarkdown(currencyObj[currencyName]), {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {text: "USD", callback_data: "mono/USD"},
          {text: "EUR", callback_data: "mono/EUR"},
          {text: "RUB", callback_data: "mono/RUB"},
        ],
        [
          {text: "Monobank.com.ua", url: "https://monobank.com.ua"},
        ],
      ],
      // resize_keyboard: true,
    }});
  await ctx.answerCbQuery();
});

// monoScene.leave((ctx) => {
//   ctx.reply("Menu", getMainKeyboard);
// });

monoScene.hears("where", (ctx) => ctx.reply("You are in mono scene"));

// monoScene.hears("back", (ctx) => ctx.scene.leave());

// listen all text messages
// monoScene.on("text", async (ctx) => {
//   const currencyObj = await getCurrency();
//   const currency = currencyObj[ctx.message.text];
//   if (currency) {
//     ctx.replyWithMarkdown(monoMarkdown(currency));
//   } else {
//     ctx.replyWithMarkdown(`Currency *${ctx.message.text}* not found`);
//   }
// });

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
// const menuMono = new MenuTemplate(() => "Выберите валюту");
// const submenuTemplate = new MenuTemplate(async (ctx) => {
//   const currencyObj = await getCurrency();
//   const currency = currencyObj[ctx.match[1]];
//   const text = monoMarkdown(currency);
//   return {text, parse_mode: "Markdown"};
// });
// submenuTemplate.manualRow(createBackMainMenuButtons());
// menuMono.chooseIntoSubmenu("currency", ["USD", "EUR", "RUB"], submenuTemplate);
// menuMono.url("Monobank.com.ua", "https://monobank.com.ua");
// menuMono.manualRow(createBackMainMenuButtons());
// const menuMono = new MenuTemplate(async (ctx) => {
//   let text = "";
//   if (ctx.state.currency) {
//     const currencyObj = await getCurrency();
//     text = monoMarkdown(currencyObj[ctx.state.currency]);
//   } else {
//     text = "Выберите валюту!";
//   }
//   return {text, parse_mode: "Markdown"};
// });
// menuMono.choose("currency", ["USD", "EUR", "RUB"], {
//   do: (ctx, key) => {
//     // const keyTemp = key;
//     // await ctx.reply("As am I!");
//     ctx.state.currency = key;
//     return true;
//   },
// });
// menuMono.url("Monobank.com.ua", "https://monobank.com.ua");
// menu

exports.monoScene = monoScene;
// exports.menuMono = menuMono;

