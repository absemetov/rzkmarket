const firebase = require("firebase-admin");
const download = require("./download.js");
const fs = require("fs");
const {botConfig, roundNumber} = require("./bot_start_scene");
const bucket = firebase.storage().bucket();
// const {Scenes: {BaseScene, WizardScene}} = require("telegraf");
// const {getMainKeyboard} = require("./bot_keyboards.js");
// const catalogScene = new BaseScene("catalog");
// catalogScene.use(async (ctx, next) => {
//   if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
// console.log("Catalog scene another callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
//   }
//   return next();
// });

// enter to scene
// catalog.enter(async (ctx) => {
//   const catalogsSnapshot = await firebase.firestore().collection("catalogs")
//       .where("parentId", "==", null).orderBy("orderNumber").get();
//   // generate catalogs array
//   const catalogsArray = [];
//   catalogsSnapshot.docs.forEach((doc) => {
//     catalogsArray.push(Markup.button.callback(`🗂 ${doc.data().name}`, `c/${doc.id}`));
//   });
//   // return ctx.replyWithMarkdown("RZK Market Catalog", Markup.inlineKeyboard(catalogsArray));
//   // reply with photo necessary to show ptoduct
//   return ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
//       {
//         caption: "Rzk Market Catalog 🇺🇦",
//         parse_mode: "Markdown",
//         ...Markup.inlineKeyboard(catalogsArray),
//       });
// });

// catalog.leave((ctx) => {
//   ctx.reply("Menu", getMainKeyboard);
// });

// catalogScene.hears("where", (ctx) => ctx.reply("You are in catalog scene"));

// catalogScene.hears("back", (ctx) => {
//   ctx.scene.leave();
// });

// test actions array
const catalogsActions = [];

// Show Catalogs and goods

const showCatalog = async (ctx, next) => {
  if (ctx.state.routeName === "c") {
    // get objId
    const objectId = ctx.state.params.get("o");
    const cartProductsArray = await ctx.state.cart.products(objectId);
    const cartButtons = await ctx.state.cart.cartButtons(objectId);
    const catalogId = ctx.state.param;
    const tag = ctx.state.params.get("t");
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    // const noPath = ctx.state.params.get("np");
    const inlineKeyboardArray =[];
    let currentCatalog = {};
    // save path to session
    // if (!noPath) {
    // await ctx.state.cart.setSessionData({path: ctx.callbackQuery.data});
    ctx.session.pathCatalog = ctx.callbackQuery.data;
    // }
    // Get catalogs snap index or siblings
    const catalogsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
        .collection("catalogs")
        .where("parentId", "==", catalogId ? catalogId : null).orderBy("orderNumber").get();
    // get current catalog
    if (catalogId) {
      const currentCatalogSnapshot = await firebase.firestore().collection("objects").doc(objectId)
          .collection("catalogs").doc(catalogId).get();
      currentCatalog = {id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data()};
      // back button
      inlineKeyboardArray.push([{text: `⤴️ ../${currentCatalog.name}`,
        callback_data: currentCatalog.parentId ? `c/${currentCatalog.parentId}?o=${objectId}` : `c?o=${objectId}`}]);
      // get products
      // textMessage += `\n> <b>${currentCatalog.name}</b>`;
      // Products query
      let mainQuery = firebase.firestore().collection("objects").doc(objectId)
          .collection("products").where("catalog.id", "==", currentCatalog.id)
          .orderBy("orderNumber");
      // Filter by tag
      let tagUrl = "";
      if (tag) {
        mainQuery = mainQuery.where("tags", "array-contains", tag);
        tagUrl = `&t=${tag}`;
      }
      // Add tags button
      if (currentCatalog.tags) {
        const tagsArray = [];
        // inlineKeyboardArray.push(Markup.button.callback(`📌 Tags ${selectedTag}`,
        //    `t/${currentCatalog.id}?tagSelected=${params.get("tag")}`));
        tagsArray.push({text: "📌 Фильтр",
          callback_data: `t/${currentCatalog.id}?o=${objectId}`});
        // Delete or close selected tag
        if (tag) {
          tagsArray[0].callback_data = `t/${currentCatalog.id}?tagSelected=${tag}&o=${objectId}`;
          tagsArray.push({text: `❎ ${tag}`, callback_data: `c/${currentCatalog.id}?o=${objectId}`});
        }
        inlineKeyboardArray.push(tagsArray);
      }
      // Paginate goods
      // copy main query
      let query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await firebase.firestore().collection("objects").doc(objectId)
            .collection("products")
            .doc(startAfter).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await firebase.firestore().collection("objects").doc(objectId)
            .collection("products")
            .doc(endBefore).get();
        query = query.endBefore(endBeforeProduct).limitToLast(10);
      } else {
        query = query.limit(10);
      }
      // get Products
      const productsSnapshot = await query.get();
      // generate products array
      for (const product of productsSnapshot.docs) {
        // inlineKeyboardArray.push(Markup.button.callback(`📦 ${product.data().name} (${product.id})`,
        //    `p/${product.id}/${ctx.callbackQuery.data}`));
        // Get cart
        const addButton = {text: `📦 ${product.data().name} (${product.id}) = ${product.data().price}`+
          ` ${botConfig.currency}`, callback_data: `aC/${product.id}?o=${objectId}`};
        // get cart products
        const cartProduct = cartProductsArray.find((x) => x.id === product.id);
        if (cartProduct) {
          addButton.text = `🛒 ${product.data().name} (${product.id})` +
          `=${cartProduct.price} ${botConfig.currency}*${cartProduct.qty}${cartProduct.unit}` +
          `=${roundNumber(cartProduct.qty * cartProduct.price)}${botConfig.currency}`;
          addButton.callback_data = `aC/${product.id}?qty=${cartProduct.qty}&a=1&o=${objectId}`;
        }
        inlineKeyboardArray.push([addButton]);
      }
      // Set load more button
      if (!productsSnapshot.empty) {
        const prevNext = [];
        // endBefore prev button e paaram
        const endBeforeSnap = productsSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          // inlineKeyboardArray.push(Markup.button.callback("⬅️ Back",
          //    `c/${currentCatalog.id}?endBefore=${endBefore.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "⬅️ Назад",
            callback_data: `c/${currentCatalog.id}?e=${endBeforeSnap.id}${tagUrl}&o=${objectId}`});
        }
        // startAfter
        const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          // startAfter iqual s
          // inlineKeyboardArray.push(Markup.button.callback("➡️ Load more",
          //    `c/${currentCatalog.id}?startAfter=${startAfter.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "➡️ Вперед",
            callback_data: `c/${currentCatalog.id}?s=${startAfterSnap.id}${tagUrl}&o=${objectId}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
      // =====
      // add back button
      // inlineKeyboardArray.push(Markup.button.callback("⤴️ Parent catalog",
      //  currentCatalog.parentId ? `c/${currentCatalog.parentId}` : "c/"));
    }
    // Show catalog siblings
    catalogsSnapshot.docs.forEach((doc) => {
      // inlineKeyboardArray.push(Markup.button.callback(`🗂 ${doc.data().name}`, `c/${doc.id}`));
      inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id}?o=${objectId}`}]);
    });
    // const extraObject = {
    //   parse_mode: "Markdown",
    //   ...Markup.inlineKeyboard(inlineKeyboardArray,
    //       {wrap: (btn, index, currentRow) => {
    //         return index <= 20;
    //       }}),
    // };
    // await ctx.editMessageText(`${textMessage}`, extraObject);
    // await ctx.editMessageCaption(`${textMessage}`, extraObject);
    const objectSnap = await firebase.firestore().collection("objects").doc(objectId).get();
    const object = {"id": objectSnap.id, ...objectSnap.data()};
    // footer buttons
    cartButtons[0].text = `🏪 ${object.name}`;
    inlineKeyboardArray.push(cartButtons);
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: `<b>${botConfig.name} > ${object.name} > Каталог</b>`,
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showCatalog);
// show product
const showProduct = async (ctx, next) => {
  if (ctx.state.routeName === "p") {
    // get product data
    const productId = ctx.state.param;
    const objectId = ctx.state.params.get("o");
    const productSnapshot = await firebase.firestore().collection("products").doc(productId).get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    // cart button
    const cartProductsArray = await ctx.state.cart.products();
    let cartTxt = "🛒 Корзина";
    if (cartProductsArray.length) {
      cartTxt += ` (${cartProductsArray.length})`;
    }
    const footerButtons = [
      {text: "🏠 Главная", callback_data: `objects/${objectId}`},
      {text: cartTxt, callback_data: `cart?o=${objectId}`},
    ];
    // generate array
    // const session = await ctx.state.cart.getSessionData();
    let catalogUrl = `c/${product.catalog.id}`;
    if (ctx.session.pathCatalog) {
      catalogUrl = ctx.session.pathCatalog;
    }
    const inlineKeyboardArray = [];
    // inlineKeyboardArray.push(Markup.button.callback("📸 Upload photo", `uploadPhotos/${product.id}`));
    inlineKeyboardArray.push([{text: `⤴️ ../${product.catalog.name}`, callback_data: catalogUrl}]);
    // default add button
    const addButton = {text: "🛒 Добавить в корзину", callback_data: `aC/${product.id}`};
    // get cart products
    const cartProduct = cartProductsArray.find((x) => x.id === product.id);
    if (cartProduct) {
      addButton.text = `🛒 ${cartProduct.qty} ${cartProduct.unit} ` +
      ` ${roundNumber(cartProduct.qty * cartProduct.price)} ${botConfig.currency}`;
      addButton.callback_data = `aC/${product.id}?qty=${cartProduct.qty}&a=1`;
    }
    inlineKeyboardArray.push([addButton]);
    if (ctx.state.isAdmin) {
      inlineKeyboardArray.push([{text: "📸 Загрузить фото",
        callback_data: `uploadPhoto/${product.id}`}]);
    }
    // chck photos
    if (product.photos && product.photos.length) {
      // inlineKeyboardArray.push(Markup.button.callback("🖼 Show photos", `showPhotos/${product.id}`));
      inlineKeyboardArray.push([{text: `🖼 Показать фото (${product.photos.length})`,
        callback_data: `showPhotos/${product.id}`}]);
    }
    // Get main photo url.
    let publicImgUrl = "";
    if (product.mainPhoto) {
      const photoExists = await bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).exists();
      if (photoExists[0]) {
        publicImgUrl = bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).publicUrl();
      }
    } else {
      publicImgUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
    }
    // Set Main menu
    inlineKeyboardArray.push(footerButtons);
    await ctx.editMessageMedia({
      type: "photo",
      media: publicImgUrl,
      caption: `<b>${product.name} (${product.id})\nЦена ${product.price} ${botConfig.currency}</b>`,
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showProduct);

// add product to cart by keyboard
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "aC") {
    // const session = await ctx.state.cart.getSessionData();
    let qty = ctx.state.params.get("qty");
    const number = ctx.state.params.get("number");
    const back = ctx.state.params.get("back");
    const redirectToCart = ctx.state.params.get("r");
    const added = ctx.state.params.get("a");
    const productId = ctx.state.param;
    const addValue = ctx.state.params.get("add_value");
    const objectId = ctx.state.params.get("o");
    let qtyUrl = "";
    let paramsUrl = "";
    if (qty) {
      if (number) {
        qty += number;
      }
      if (back) {
        qty = qty.slice(0, -1);
      }
    } else {
      // add first
      if (Number(number)) {
        qty = number;
      } else {
        // generate response
        const dateTimestamp = Math.floor(Date.now() / 1000);
        paramsUrl += `&${dateTimestamp}`;
      }
    }
    if (qty) {
      qtyUrl = `&qty=${qty}`;
    } else {
      qty = 0;
    }
    // add redirect param and clear path
    if (redirectToCart) {
      paramsUrl += "&r=1";
      ctx.session.pathCatalog = null;
    }
    if (added) {
      paramsUrl += "&a=1";
    }
    const productRef = firebase.firestore().collection("objects").doc(objectId)
        .collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (productSnapshot.exists) {
      const product = {id: productSnapshot.id, ...productSnapshot.data()};
      let catalogUrl = `c/${product.catalog.id}?o=${objectId}`;
      if (ctx.session.pathCatalog) {
        catalogUrl = ctx.session.pathCatalog;
      }
      // Add product to cart
      if (addValue) {
        await ctx.state.cart.add(objectId, added ? product.id : product, addValue);
        // redirect to catalog or cart
        // if (session.path) {
        if (!redirectToCart) {
          // generate params to show catalog
          ctx.state.routeName = "c";
          // eslint-disable-next-line no-useless-escape
          const regPath = catalogUrl.match(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&\/:~+]+)?/);
          ctx.state.param = regPath[2];
          const args = regPath[3];
          // parse url params
          // const params = new Map();
          ctx.state.params.clear();
          if (args) {
            for (const paramsData of args.split("&")) {
              ctx.state.params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
            }
          }
          // add flag for not save
          // ctx.state.params.set("np", 1);
          // params.set("cb", 1);
          // ctx.state.params = params;
          ctx.callbackQuery.data = catalogUrl;
          await showCatalog(ctx, next);
        } else {
          // ctx.state.routeName = "p";
          // await showProduct(ctx, next);
          ctx.state.routeName = "cart";
          await showCart(ctx, next);
        }
        return;
      }
      const addButtonArray = [];
      const addButton = {text: "🛒 Добавить",
        callback_data: `aC/${product.id}?add_value=${qty}${paramsUrl}&o=${objectId}`};
      const delButton = {text: "❎ Удалить",
        callback_data: `aC/${product.id}?add_value=0${paramsUrl}&o=${objectId}`};
      if (added) {
        addButtonArray.push(delButton);
      }
      // if (redirect) {
      //   addButton.callback_data = `cart/${product.id}?qty=${qty}`;
      //   delButton.callback_data = `cart/${product.id}?qty=0`;
      // }
      addButtonArray.push(addButton);
      // Get main photo url.
      let publicImgUrl = "";
      if (product.mainPhoto) {
        const photoExists = await bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).exists();
        if (photoExists[0]) {
          publicImgUrl = bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).publicUrl();
        }
      } else {
        publicImgUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
      }
      await ctx.editMessageMedia({
        type: "photo",
        media: publicImgUrl,
        caption: `${product.name} (${product.id})` +
        `\nЦена ${product.price} ${botConfig.currency}` +
        `\nСумма ${roundNumber(qty * product.price)} ${botConfig.currency}` +
        `\n<b>Количетво: ${qty} ${product.unit}</b>`,
        parse_mode: "html",
      }, {reply_markup: {
        inline_keyboard: [
          [{text: `⤴️ ../${product.catalog.name}`, callback_data: catalogUrl}],
          [
            {text: "7", callback_data: `aC/${product.id}?number=7${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "8", callback_data: `aC/${product.id}?number=8${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "9", callback_data: `aC/${product.id}?number=9${qtyUrl}${paramsUrl}&o=${objectId}`},
          ],
          [
            {text: "4", callback_data: `aC/${product.id}?number=4${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "5", callback_data: `aC/${product.id}?number=5${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "6", callback_data: `aC/${product.id}?number=6${qtyUrl}${paramsUrl}&o=${objectId}`},
          ],
          [
            {text: "1", callback_data: `aC/${product.id}?number=1${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "2", callback_data: `aC/${product.id}?number=2${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "3", callback_data: `aC/${product.id}?number=3${qtyUrl}${paramsUrl}&o=${objectId}`},
          ],
          [
            {text: "0️", callback_data: `aC/${product.id}?number=0${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "🔙", callback_data: `aC/${product.id}?back=true${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "AC", callback_data: `aC/${product.id}?clear=1${paramsUrl}&o=${objectId}`},
          ],
          addButtonArray,
          [
            {text: `⤴️ ${product.name} (${product.id})`, callback_data: `p/${product.id}?o=${objectId}`},
          ],
        ],
      }});
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// show cart
const showCart = async (ctx, next) => {
  if (ctx.state.routeName === "cart") {
    // await ctx.state.cart.setSessionData({path: null});
    // get orderId for edit
    // if (!orderId) {
    //   // default values
    //   await ctx.state.cart.setData({
    //     cart: {
    //       orderData: {
    //         carrierNumber: firebase.firestore.FieldValue.delete(),
    //         comment: firebase.firestore.FieldValue.delete(),
    //       },
    //     },
    //     session: {
    //       path: firebase.firestore.FieldValue.delete(),
    //     },
    //   });
    // }
    // clear cart
    const clear = ctx.state.params.get("clear");
    const deleteOrderId = ctx.state.params.get("deleteOrderId");
    const objectId = ctx.state.params.get("o");
    if (deleteOrderId) {
      await ctx.state.cart.setCartData({
        orderData: firebase.firestore.FieldValue.delete(),
      });
    }
    if (clear) {
      await ctx.state.cart.clear(objectId);
    }
    const inlineKeyboardArray = [];
    const objectSnap = await firebase.firestore().collection("objects").doc(objectId).get();
    const object = {"id": objectSnap.id, ...objectSnap.data()};
    let msgTxt = `<b> ${botConfig.name} > ${object.name} > Корзина</b>\n`;
    // loop products
    let totalQty = 0;
    let totalSum = 0;
    const products = await ctx.state.cart.products(objectId);
    for (const [index, product] of products.entries()) {
      const productTxt = `${index + 1}) ${product.name} (${product.id})` +
      `=${product.price} ${botConfig.currency}*${product.qty}${product.unit}` +
      `=${roundNumber(product.price * product.qty)}${botConfig.currency}`;
      msgTxt += `${productTxt}\n`;
      inlineKeyboardArray.push([
        {text: `${productTxt}`, callback_data: `aC/${product.id}?qty=${product.qty}&r=1&a=1&o=${objectId}`},
      ]);
      totalQty += product.qty;
      totalSum += product.qty * product.price;
    }
    if (totalQty) {
      msgTxt += `<b>Количество товара: ${totalQty}\n` +
      `Сумма: ${roundNumber(totalSum)} ${botConfig.currency}</b>`;
    }

    if (inlineKeyboardArray.length < 1) {
      inlineKeyboardArray.push([
        {text: "📁 Каталог", callback_data: `c?o=${objectId}`},
      ]);
      msgTxt += "Корзина пуста";
    } else {
      // order button
      const orderData = await ctx.state.cart.getOrderData();
      const orderId = orderData.orderId;
      if (orderId) {
        inlineKeyboardArray.push([{text: `✅ Сохранить Заказ #${orderId} от ${orderData.recipientName}`,
          callback_data: `orders/${orderData.id}?save=products`}]);
        // delete order from cart
        inlineKeyboardArray.push([{text: `❎ Убрать Заказ #${orderId} от ${orderData.recipientName}`,
          callback_data: `cart?deleteOrderId=${orderData.id}`}]);
      }
      // create order
      inlineKeyboardArray.push([{text: "✅ Оформить заказ",
        callback_data: `cO/carrier?o=${objectId}`}]);
      // clear cart
      inlineKeyboardArray.push([{text: "🗑 Очистить корзину",
        callback_data: `cart?clear=1&o=${objectId}`}]);
    }
    // Set Main menu
    inlineKeyboardArray.push([{text: `🏪 ${object.name}`,
      callback_data: `objects/${objectId}`}]);
    // render data
    // truncate long string
    if (msgTxt.length > 1024) {
      msgTxt = msgTxt.substring(0, 1024);
    }
    // edit message
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: msgTxt,
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showCart);

// wizard scene
const cartWizard = [
  // show carrier services
  async (ctx, caption, inlineKeyboardArray = []) => {
    await ctx.editMessageCaption(`<b>${caption}:</b>`,
        {
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: [...inlineKeyboardArray],
          },
        });
  },
  async (ctx, error) => {
    const inlineKeyboardArray = [];
    let qty = ctx.state.params.get("qty");
    const number = ctx.state.params.get("number");
    const back = ctx.state.params.get("back");
    const carrierId = ctx.state.params.get("cId");
    const orderId = ctx.state.params.get("o");
    // save data to cart
    // if (carrierId) {
    //   carrierId = Number(carrierId);
    //   // await ctx.state.cart.setOrderData({carrierId});
    // }
    let qtyUrl = "";
    if (qty) {
      if (number) {
        qty += number;
      }
      if (back) {
        qty = qty.slice(0, -1);
      }
      // if (clear) {
      //   qty = 0;
      // }
    } else {
      // add first
      if (Number(number)) {
        qty = number;
      }
    }
    if (qty) {
      qtyUrl = `&qty=${qty}`;
    } else {
      qty = 0;
    }
    // add carrier ID
    if (carrierId) {
      qtyUrl += `&cId=${carrierId}`;
    }
    // add orderId to url
    let paramsUrl = "";
    if (orderId) {
      paramsUrl = `&o=${orderId}`;
    }
    inlineKeyboardArray.push([
      {text: "7", callback_data: `cO/cN?number=7${qtyUrl}${paramsUrl}`},
      {text: "8", callback_data: `cO/cN?number=8${qtyUrl}${paramsUrl}`},
      {text: "9", callback_data: `cO/cN?number=9${qtyUrl}${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "4", callback_data: `cO/cN?number=4${qtyUrl}${paramsUrl}`},
      {text: "5", callback_data: `cO/cN?number=5${qtyUrl}${paramsUrl}`},
      {text: "6", callback_data: `cO/cN?number=6${qtyUrl}${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "1", callback_data: `cO/cN?number=1${qtyUrl}${paramsUrl}`},
      {text: "2", callback_data: `cO/cN?number=2${qtyUrl}${paramsUrl}`},
      {text: "3", callback_data: `cO/cN?number=3${qtyUrl}${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "0️", callback_data: `cO/cN?number=0${qtyUrl}${paramsUrl}`},
      {text: "🔙", callback_data: `cO/cN?back=true${qtyUrl}${paramsUrl}`},
      {text: "AC", callback_data: `cO/cN?cId=${carrierId}${paramsUrl}`},
    ]);
    // if order change callback
    if (orderId) {
      inlineKeyboardArray.push([{text: "Выбрать отделение", callback_data: `editOrder/${orderId}?` +
      `sCid=${carrierId}&number=${qty}`}]);
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `orders/${orderId}`}]);
    } else {
      inlineKeyboardArray.push([{text: "Выбрать отделение", callback_data: `cO/payment?cN=${qty}` +
      `&cId=${carrierId}`}]);
      inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: "cart"}]);
    }
    await ctx.editMessageCaption(`Введите номер отделения:\n<b>${qty}</b>` +
      `\n${error ? "Ошибка: введите номер отделения" : ""}`,
    {
      parse_mode: "html",
      reply_markup: {
        inline_keyboard: [...inlineKeyboardArray],
      },
    });
  },
  async (ctx) => {
    ctx.reply("Укажите адрес доставки (город)", {
      reply_markup: {
        keyboard: [["Отмена"]],
        resize_keyboard: true,
      }});
    // await ctx.state.cart.setSessionData({cursor: 3});
    await ctx.state.cart.setSessionData({scene: "wizardOrder", cursor: 3});
    // ctx.session.cursor = 3;
    // ctx.session.scene = "wizardOrder";
  },
  async (ctx) => {
    // save data to cart
    if (ctx.message.text.length < 2) {
      ctx.reply("Адрес слишком короткий");
      return;
    }
    await ctx.state.cart.setWizardData({address: ctx.message.text});
    let userName = "";
    if (ctx.from.last_name) {
      userName += ctx.from.last_name;
    }
    if (ctx.from.first_name) {
      userName += " " + ctx.from.first_name;
    }
    ctx.reply("Введите фамилию и имя получателя, или выберите себя", {
      reply_markup: {
        keyboard: [[userName], ["Отмена"]],
        resize_keyboard: true,
      }});
    // await ctx.state.cart.setSessionData({cursor: 4});
    await ctx.state.cart.setSessionData({cursor: 4});
    // ctx.session.cursor = 4;
  },
  async (ctx) => {
    // validation example
    if (ctx.message.text.length < 2) {
      ctx.reply("Имя слишком короткое");
      return;
    }
    // save data to cart
    await ctx.state.cart.setWizardData({recipientName: ctx.message.text});
    ctx.reply("Введите номер телефона", {
      reply_markup: {
        keyboard: [
          [{
            text: "Отправить свой номер",
            request_contact: true,
          }],
          ["Отмена"],
        ],
        resize_keyboard: true,
      },
    });
    // await ctx.state.cart.setSessionData({cursor: 5});
    await ctx.state.cart.setSessionData({cursor: 5});
    // ctx.session.cursor = 5;
  },
  async (ctx) => {
    const phoneNumber = (ctx.message.contact && ctx.message.contact.phone_number) || ctx.message.text;
    // const checkPhoneUa = phoneNumber.match(/^(\+380|0)?([1-9]{1}\d{8})$/);
    const checkPhone = phoneNumber.match(/^(\+7|7|8)?([489][0-9]{2}[0-9]{7})$/);
    if (!checkPhone) {
      ctx.reply("Введите номер телефона в формате +7YYYXXXXXXX");
      return;
    }
    // save phone to cart
    await ctx.state.cart.setWizardData({phoneNumber: "+7" + checkPhone[2]});
    // comment order
    ctx.replyWithHTML("Комментарий к заказу:",
        {
          reply_markup: {
            keyboard: [
              ["Без комментариев"],
              ["Отмена"],
            ],
            resize_keyboard: true,
          }});
    // await ctx.state.cart.setSessionData({cursor: 6});
    await ctx.state.cart.setSessionData({cursor: 6});
    // ctx.session.cursor = 6;
  },
  async (ctx) => {
    if (ctx.message.text && ctx.message.text !== "Без комментариев") {
      // save phone to cart
      await ctx.state.cart.setWizardData({comment: ctx.message.text});
    }
    // get preorder data
    const preOrderData = await ctx.state.cart.getWizardData();
    ctx.replyWithHTML("<b>Проверьте даные получателя:\n" +
        `${preOrderData.recipientName} ${preOrderData.phoneNumber}\n` +
        `Адрес доставки: ${preOrderData.address}, ` +
        `${ctx.state.cart.carriers().get(preOrderData.carrierId)} ` +
        `${preOrderData.carrierNumber ? "#" + preOrderData.carrierNumber : ""}\n` +
        `Оплата: ${ctx.state.cart.payments().get(preOrderData.paymentId)}\n` +
        `${preOrderData.comment ? "Комментарий: " + preOrderData.comment : ""}</b>`,
    {
      reply_markup: {
        keyboard: [
          ["Оформить заказ"],
          ["Отмена"],
        ],
        resize_keyboard: true,
      }});
    // leave wizard
    // await ctx.state.cart.setSessionData({cursor: 7});
    await ctx.state.cart.setSessionData({cursor: 7});
    // ctx.session.cursor = 7;
  },
  async (ctx, next) => {
    if (ctx.message.text === "Оформить заказ") {
      // save order
      await ctx.state.cart.saveOrder();
      await ctx.reply("Спасибо за заказ! /objects", {
        reply_markup: {
          remove_keyboard: true,
        }});
      await ctx.telegram.sendMessage(94899148, "New order from bot!" );
      // exit scene
      await ctx.state.cart.setSessionData({scene: null});
    }
    // leave wizard
    // await ctx.state.cart.setSessionData({scene: null});
    // ctx.session.scene = null;
  },
];

// save order final
catalogsActions.push( async (ctx, next) => {
  // ctx.scene.state.name = ctx.message.text;
  if (ctx.state.routeName === "cO") {
    const todo = ctx.state.param;
    // first step carrier
    if (todo === "carrier") {
      // save objectId
      const objectId = ctx.state.params.get("o");
      await ctx.state.cart.setSessionData({objectId});
      // set default values
      await ctx.state.cart.setWizardData({
        carrierNumber: null,
        comment: null,
      });
      // get carriers service
      const inlineKeyboardArray = [];
      ctx.state.cart.carriers().forEach((value, key) => {
        if (key === 1) {
          inlineKeyboardArray.push([{text: value, callback_data: `cO/payment?cId=${key}`}]);
        } else {
          inlineKeyboardArray.push([{text: value, callback_data: `cO/cN?cId=${key}`}]);
        }
      });
      inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: "cart"}]);
      await cartWizard[0](ctx, "Способ доставки", inlineKeyboardArray);
    }
    // set carrier number
    if (todo === "cN") {
      await cartWizard[1](ctx);
    }
    // order payment method
    if (todo === "payment") {
      // save data to cart
      let carrierId = ctx.state.params.get("cId");
      if (carrierId) {
        carrierId = Number(carrierId);
        await ctx.state.cart.setWizardData({carrierId});
      }
      // if user not chuse carrier number
      let carrierNumber = ctx.state.params.get("cN");
      carrierNumber = Number(carrierNumber);
      if (carrierId === 2 && !carrierNumber) {
        // return first step error
        await cartWizard[1](ctx, "errorCurrierNumber");
        return;
      }
      // save carrierNumber
      if (carrierNumber) {
        await ctx.state.cart.setWizardData({carrierNumber});
      }
      // show paymets service
      const inlineKeyboardArray = [];
      ctx.state.cart.payments().forEach((value, key) => {
        inlineKeyboardArray.push([{text: value, callback_data: `cO/wizard?payment_id=${key}`}]);
      });
      inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: "cart"}]);
      await cartWizard[0](ctx, "Способ оплаты", inlineKeyboardArray);
    }
    // save payment and goto wizard
    if (todo === "wizard") {
      let paymentId = ctx.state.params.get("payment_id");
      if (paymentId) {
        paymentId = Number(paymentId);
      }
      // save data to cart
      if (paymentId) {
        await ctx.state.cart.setWizardData({paymentId});
      }
      await ctx.deleteMessage();
      // await ctx.scene.enter("order");
      // set session
      // await ctx.state.cart.setSessionData({scene: "cO", cursor: 0});
      // ctx.session = {scene: "cO"};
      // ctx.session = {cursor: 0};
      // start wizard
      cartWizard[2](ctx);
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// show tags
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "t") {
    const inlineKeyboardArray = [];
    const catalogId = ctx.state.param;
    const objectId = ctx.state.params.get("o");
    // const session = await ctx.state.cart.getSessionData();
    const currentCatalogSnapshot = await firebase.firestore().collection("objects").doc(objectId)
        .collection("catalogs").doc(catalogId).get();
    const catalog = {id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data()};
    let catalogUrl = `c/${catalog.id}?o=${objectId}`;
    if (ctx.session.pathCatalog) {
      catalogUrl = ctx.session.pathCatalog;
    }
    inlineKeyboardArray.push([{text: `⤴️ ../${catalog.name}`,
      callback_data: catalogUrl}]);
    for (const tag of catalog.tags) {
      if (tag.id === ctx.state.params.get("tagSelected")) {
        // inlineKeyboardArray.push(Markup.button.callback(`✅ ${tag.name}`, `c/c/${catalog.id}?tag=${tag.id}`));
        inlineKeyboardArray.push([{text: `✅ ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}&o=${objectId}`}]);
      } else {
        // inlineKeyboardArray.push(Markup.button.callback(`📌 ${tag.name}`, `c/c/${catalog.id}?tag=${tag.id}`));
        inlineKeyboardArray.push([{text: `📌 ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}&o=${objectId}`}]);
      }
    }
    // close tags
    // inlineKeyboardArray.push([{text: "⤴️ Перейти в каталог", callback_data: session.path}]);
    const objectSnap = await firebase.firestore().collection("objects").doc(objectId).get();
    const object = {"id": objectSnap.id, ...objectSnap.data()};
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: `<b>${botConfig.name} > ${object.name} > Фильтр</b>`,
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Show all photos
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "showPhotos") {
    const productId = ctx.state.param;
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    for (const [index, photoId] of product.photos.entries()) {
      const inlineKeyboardArray = [];
      // check if file exists
      let publicUrl = "";
      const photoExists = await bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).exists();
      if (photoExists[0]) {
        publicUrl = bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).publicUrl();
      } else {
        publicUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
      }
      // if admin
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: "🏷 Set main",
          callback_data: `setMainPhoto/${product.id}?photoId=${photoId}`}]);
        inlineKeyboardArray.push([{text: "🗑 Delete", callback_data: `deletePhoto/${product.id}?photoId=${photoId}`}]);
      }
      inlineKeyboardArray.push([{text: "❎ Закрыть", callback_data: "closePhoto"}]);
      await ctx.replyWithPhoto({url: publicUrl}, {
        caption: product.mainPhoto === photoId ?
          `✅ Photo <b>#${index + 1}</b> (Main Photo) ${product.name} (${product.id})` :
          `Photo #${index + 1} ${product.name} (${product.id})`,
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: [...inlineKeyboardArray],
        },
      });
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Set Main photo product
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "setMainPhoto") {
    const productId = ctx.state.param;
    const photoId = ctx.state.params.get("photoId");
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    await productRef.update({
      mainPhoto: photoId,
    });
    // ctx.reply(`Main photo updated, productId ${productId} ${fileId}`);
    await ctx.editMessageCaption(`Main photo updated, ${productSnapshot.data().name} ${productId}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{text: "🏷 Set main", callback_data: `setMainPhoto/${productId}/${photoId}`}],
              [{text: "❎ Close", callback_data: "closePhoto"}],
              [{text: "🗑 Delete", callback_data: `deletePhoto/${productId}/${photoId}`}],
            ],
          },
        });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// close Photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "closePhoto") {
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// delete Photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "deletePhoto") {
    const productId = ctx.state.param;
    const deleteFileId = ctx.state.params.get("photoId");
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    // if delete main Photo
    if (productSnapshot.data().mainPhoto === deleteFileId) {
      // set new main photo inddex 1 or delete
      if (productSnapshot.data().photos && productSnapshot.data().photos.length > 1) {
        for (const photoId of productSnapshot.data().photos) {
          if (photoId !== deleteFileId) {
            await productRef.update({
              mainPhoto: photoId,
              photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
            });
            break;
          }
        }
      } else {
        await productRef.update({
          mainPhoto: firebase.firestore.FieldValue.delete(),
          // mainPhoto: "",
          photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
        });
      }
    } else {
      await productRef.update({
        photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
      });
    }
    const photoExists = await bucket.file(`photos/products/${productId}/1/${deleteFileId}.jpg`).exists();
    if (photoExists[0]) {
      await bucket.file(`photos/products/${productId}/3/${deleteFileId}.jpg`).delete();
      await bucket.file(`photos/products/${productId}/2/${deleteFileId}.jpg`).delete();
      await bucket.file(`photos/products/${productId}/1/${deleteFileId}.jpg`).delete();
    }
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// upload photos limit 5
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhoto") {
    // save productId to session data
    // await ctx.state.cart.setSessionData({productId: ctx.state.param});
    ctx.session.productId = ctx.state.param;
    // enter catalog scene
    // if (ctx.scene.current) {
    //   if (ctx.scene.current.id !== "catalog") {
    //     ctx.scene.enter("catalog");
    //   }
    // } else {
    //   ctx.scene.enter("catalog");
    // }
    const productRef = firebase.firestore().collection("products").doc(ctx.state.param);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    ctx.replyWithHTML(`Please add photo to <b>${product.name} (${product.id})</b>`);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Upload product photos
const uploadPhotoProduct = async (ctx, next) => {
  // const session = await ctx.state.cart.getSessionData();
  const productId = ctx.session.productId;
  if (productId) {
    // make bucket is public
    await bucket.makePublic();
    // file_id: 'AgACAgIAAxkBAAJKe2Eeb3sz3VbX5NP2xB0MphISptBEAAIjtTEbNKZhSJTK4DMrPuXqAQADAgADcwADIAQ',
    // file_unique_id: 'AQADI7UxGzSmYUh4',
    // file_size: 912,
    // width: 90,
    // height: 51
    // get Product data
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    // get count photos to check limits 5 photos
    if (product.photos && product.photos.length > 4) {
      await ctx.reply("Limit 5 photos");
    } else {
      // upload Photo
      // upload only one photo!!!
      if (ctx.message.media_group_id) {
        await ctx.reply("Choose only one Photo!");
        return next();
      }
      // get telegram file_id photos data
      const origin = ctx.message.photo[3];
      const big = ctx.message.photo[2];
      const thumbnail = ctx.message.photo[1];
      // If 720*1280 photo[3] empty
      if (!origin) {
        await ctx.reply("Choose large photo!");
        return next();
      }
      // get photos url
      const originUrl = await ctx.telegram.getFileLink(origin.file_id);
      const bigUrl = await ctx.telegram.getFileLink(big.file_id);
      const thumbnailUrl = await ctx.telegram.getFileLink(thumbnail.file_id);
      try {
        // download photos from telegram server
        const originFilePath = await download(originUrl.href);
        const bigFilePath = await download(bigUrl.href);
        const thumbnailFilePath = await download(thumbnailUrl.href);
        // upload photo file
        await bucket.upload(originFilePath, {
          destination: `photos/products/${product.id}/3/${origin.file_unique_id}.jpg`,
        });
        await bucket.upload(bigFilePath, {
          destination: `photos/products/${product.id}/2/${origin.file_unique_id}.jpg`,
        });
        await bucket.upload(thumbnailFilePath, {
          destination: `photos/products/${product.id}/1/${origin.file_unique_id}.jpg`,
        });
        // delete download file
        fs.unlinkSync(originFilePath);
        fs.unlinkSync(bigFilePath);
        fs.unlinkSync(thumbnailFilePath);
      } catch (e) {
        console.log("Download failed");
        console.log(e.message);
        await ctx.reply(`Error upload photos ${e.message}`);
      }
      // save fileID to Firestore
      if (!product.mainPhoto) {
        await productRef.update({
          mainPhoto: origin.file_unique_id,
          photos: firebase.firestore.FieldValue.arrayUnion(origin.file_unique_id),
        });
      } else {
        await productRef.update({
          photos: firebase.firestore.FieldValue.arrayUnion(origin.file_unique_id),
        });
      }
      const publicUrl = bucket.file(`photos/products/${product.id}/2/${origin.file_unique_id}.jpg`).publicUrl();
      // get catalog url (path)
      let catalogUrl = `c/${product.catalog.id}`;
      if (ctx.session.pathCatalog) {
        catalogUrl = ctx.session.pathCatalog;
      }
      await ctx.replyWithPhoto({url: publicUrl},
          {
            caption: `${product.name} (${product.id}) photo uploaded`,
            reply_markup: {
              inline_keyboard: [
                [{text: "📸 Upload photo", callback_data: `uploadPhoto/${product.id}`}],
                [{text: `🖼 Show photos (${product.photos ? product.photos.length + 1 : 1})`,
                  callback_data: `showPhotos/${product.id}`}],
                [{text: "⤴️ Goto catalog",
                  callback_data: catalogUrl}],
              ],
            },
          });
    }
    // ctx.session.productId = null;
    // await ctx.state.cart.setSessionData({productId: null});
    ctx.session.productId = null;
  } else {
    ctx.reply("Please select a product to upload Photo");
  }
};

exports.uploadPhotoProduct = uploadPhotoProduct;
exports.catalogsActions = catalogsActions;
exports.cartWizard = cartWizard;
exports.showCart = showCart;
