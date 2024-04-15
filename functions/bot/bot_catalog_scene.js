const {getFirestore, FieldValue} = require("firebase-admin/firestore");
// const firebase = require("firebase-admin");
// const firestore = require("firebase-admin/firestore");
const {cart, store, roundNumber, photoCheckUrl, deletePhotoStorage, encodeCyrillic} = require("./bot_store_cart");
const {searchProductHandle, algoliaIndexProducts} = require("./bot_search");
const {parseUrl} = require("./bot_start_scene");
// catalogs actions array
const catalogsActions = [];

// show product
const showProduct = async (ctx, next) => {
  if (ctx.state.pathParams[0] === "p") {
    // enable edit mode
    const editOn = ctx.state.searchParams.get("editOn");
    const editOff = ctx.state.searchParams.get("editOff");
    // const page = ctx.state.sessionMsg.url.searchParams.get("page");
    const fromCart = ctx.state.sessionMsg.url.searchParams.get("cart");
    // edit mode
    if (editOn) {
      // uUrl += "&u=1";
      ctx.state.sessionMsg.url.searchParams.set("editMode", true);
      await ctx.answerCbQuery("Edit Mode Enable");
    }
    if (editOff) {
      ctx.state.sessionMsg.url.searchParams.delete("editMode");
      await ctx.answerCbQuery("Edit Mode disable");
    }
    // get product data
    const productId = ctx.state.pathParams[1];
    // const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const objectId = ctx.state.pathParams[2] || ctx.state.sessionMsg.url.searchParams.get("oId");
    if (ctx.state.pathParams[2]) {
      ctx.state.sessionMsg.url.searchParams.set("oId", objectId);
    }
    // const object = await store.findRecord(`objects/${objectId}`);
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    if (!product) {
      await ctx.answerCbQuery("Product not found");
      return;
    }
    ctx.state.sessionMsg.url.searchParams.set("pathU", product.catalogId);
    // const productPrice = roundNumber(product.price * object.currencies[product.currency]);
    // const cartButton = await cart.cartButton(ctx);
    let catalogUrl = `c/${product.catalogId.substring(product.catalogId.lastIndexOf("#") + 1)}`;
    const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
    if (sessionPathCatalog && !fromCart && sessionPathCatalog.includes("?")) {
      if (sessionPathCatalog.includes("&b=1")) {
        catalogUrl = sessionPathCatalog;
      } else {
        catalogUrl = sessionPathCatalog + "&b=1";
      }
    } else {
      ctx.state.sessionMsg.url.searchParams.set("pathC", catalogUrl);
    }
    const inlineKeyboardArray = [];
    if (ctx.state.sessionMsg.url.searchParams.get("orderData_id")) {
      inlineKeyboardArray.push([{text: `📝 Редактор заказа 🏪 ${ctx.state.sessionMsg.url.searchParams.get("orderData_objectId")}`, callback_data: "cart"}]);
    }
    // search btn
    // const page = ctx.state.sessionMsg.url.searchParams.get("page");
    // if (page) {
    //   inlineKeyboardArray.push([{text: ctx.i18n.btn.backToSearch(), callback_data: `search/${page}`}]);
    // }
    inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"}, {text: `🏪 ${product.objectName}`, callback_data: `o/${product.objectId}`}]);
    inlineKeyboardArray.push([{text: `🗂 ${product.pathArray[product.pathArray.length - 1].name}`, callback_data: catalogUrl}]);
    // default add button
    const addButton = {text: ctx.i18n.btn.buy(), callback_data: `k/${product.id}/${product.objectId}`};
    // get cart products
    const prodBtns = [];
    if (!product.availability) {
      addButton.text = ctx.i18n.txt.notAvailable();
      addButton.callback_data = `p/${product.id}`;
    }
    prodBtns.push(addButton);
    // buy btn
    if (!product.phone) {
      inlineKeyboardArray.push(prodBtns);
    }
    // chck photos
    if (product.photos && product.photos.length) {
      inlineKeyboardArray.push([{text: `🖼 Фото (${product.photos.length})`,
        callback_data: `s/${product.id}`}]);
    }
    // Get main photo url.
    let publicImgUrl = null;
    // if (object.photoId) {
    //   publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    // }
    if (product.mainPhoto) {
      publicImgUrl = `photos/o/${product.objectId}/p/${product.id}/${product.mainPhoto}/2.jpg`;
    }
    // footer buttons
    // cartButtons[0].text = `🏪 ${object.name}`;
    // inlineKeyboardArray.push(cartButton);
    // get btn url
    const inlineKeyboard = ctx.callbackQuery.message.reply_markup.inline_keyboard;
    let urlBtn = new URL(process.env.BOT_SITE);
    inlineKeyboard.forEach((btnArray) => {
      if (btnArray[0].url) {
        urlBtn = new URL(btnArray[0].url);
      }
      // for virtual key link in second btn
      if (btnArray[1] && btnArray[1].url) {
        urlBtn = new URL(btnArray[1].url);
      }
    });
    inlineKeyboardArray.push([
      {
        text: `${product.brand ? product.brand + " " : ""}${product.name}`,
        url: `${process.env.BOT_SITE}/o/${objectId}/p/${product.id}?${urlBtn.searchParams.toString()}`,
      },
    ]);
    const media = await photoCheckUrl(publicImgUrl);
    // admin btns
    if (ctx.state.isAdmin) {
      if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
        ctx.state.sessionMsg.url.searchParams.set("cRowN", product.rowNumber);
        ctx.state.sessionMsg.url.searchParams.set("cWorkS", product.workSheet);
        // ctx.state.sessionMsg.url.searchParams.set("ePrice", product.price);
        // ctx.state.sessionMsg.url.searchParams.set("ePurchase", product.purchasePrice);
        // ctx.state.sessionMsg.url.searchParams.set("eCurrency", product.currency);
        inlineKeyboardArray.push([{text: "🔒 Отключить Режим редактирования",
          callback_data: `p/${product.id}?editOff=true`}]);
      } else {
        // if (cartProduct) {
        //   inlineKeyboardArray.push([{text: `📝 Изменить цену в корзине ${cartProduct.price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}`,
        //     callback_data: `k/${product.id}?qty=${cartProduct.price}&price=1`}]);
        // }
        inlineKeyboardArray.push([{text: "📝 Включить Режим редактирования",
          callback_data: `p/${product.id}?editOn=true`}]);
      }
    }
    // edit btns service new
    if (ctx.state.isAdmin && ctx.state.sessionMsg.url.searchParams.get("editMode")) {
      if (!product.phone) {
        inlineKeyboardArray.push([{text: `Доступность: ${product.availability ? "В наличии" : "Нет в наличии"}`,
          callback_data: `b/${product.id}/availability/A`}]);
        // inlineKeyboardArray.push([{text: "Изменить наименовение товара",
        //   callback_data: `b/${product.id}/name/C`}]);
        inlineKeyboardArray.push([{text: `Изменить закуп цену ${product.purchasePrice ? product.purchasePrice.toLocaleString("ru-RU") : "null"} ${process.env.BOT_CURRENCY}`,
          callback_data: `b/${product.id}/purchasePrice/D`}]);
        inlineKeyboardArray.push([{text: `Изменить прод цену ${product.price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}`,
          callback_data: `b/${product.id}/price/E`}]);
        inlineKeyboardArray.push([{text: "Удалить товар",
          callback_data: `b/${product.id}/del`}]);
        if (process.env.BOT_LANG === "uk") {
          inlineKeyboardArray.push([{text: "Загрузить в Merch",
            callback_data: `uploadMerch/${product.id}`}]);
        }
      }
      if (process.env.BOT_LANG === "uk") {
        inlineKeyboardArray.push([{text: "Добавить описание UA",
          callback_data: `b/${product.id}/desc`}]);
        inlineKeyboardArray.push([{text: "Добавить описание Ru",
          callback_data: `b/${product.id}/descRu`}]);
      } else {
        inlineKeyboardArray.push([{text: "Добавить описание",
          callback_data: `b/${product.id}/desc`}]);
      }
      // inlineKeyboardArray.push([{text: "Добавить пост из канала",
      //   callback_data: `b/${product.id}?todo=postId`}]);
      inlineKeyboardArray.push([{text: "📸 Загрузить фото",
        callback_data: `u/${product.id}/prod`}]);
    }
    // ` ${ctx.state.isAdmin && cartProduct ? `в корзине ${cartProduct.price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}` : ""}`
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${product.objectName}\n${product.brand ? product.brand + "\n" : ""}${product.name} (${product.id})\n` +
      `${ctx.i18n.product.price()}: ${product.phone ? "от " : ""}${product.price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}${product.phone ? " за услугу" : ""}` +
      `${product.phone ? "\nПозвонить +" + product.phone : ""}</b>` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    }});
    // edit caption after show keyboard
    // await ctx.editMessageCaption(`<b>${product.objectName}\n${product.brand ? product.brand + "\n" : ""}${product.name} (${product.id})\n` +
    // `${ctx.i18n.product.price()}: ${product.phone ? "от " : ""}${product.price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}${product.phone ? " за услугу" : ""}` +
    // `${product.phone ? "\nПозвонить +" + product.phone : ""}</b>` + ctx.state.sessionMsg.linkHTML(), {
    //   parse_mode: "html",
    //   reply_markup: {
    //     inline_keyboard: inlineKeyboardArray,
    //   }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showProduct);

// add product to cart by keyboard
catalogsActions.push(async (ctx, next) => {
  if (ctx.state.pathParams[0] === "a") {
    ctx.state.sessionMsg.url.searchParams.set("TTL", 0);
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    // const objectId = ctx.state.searchParams.get("o");
    const id = ctx.state.pathParams[1];
    // const product = await store.findRecord(`objects/${objectId}/products/${id}`);
    // const name = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
    // const name = product.name;
    // const price = + ctx.state.sessionMsg.url.searchParams.get("pPrice");
    // const unit = ctx.state.sessionMsg.url.searchParams.get("pUnit");
    // const pCart = ctx.state.sessionMsg.url.searchParams.get("pCart");
    const product = await store.findRecord(`objects/${objectId}/products/${id}`);
    const pCart = await store.findRecord(`carts/${ctx.from.id}/items/${objectId}-${id}`);
    const redirectToCart = ctx.state.sessionMsg.url.searchParams.get("cart");
    // from search page
    const page = ctx.state.sessionMsg.url.searchParams.get("page");
    const qty = + ctx.state.searchParams.get("qty") || 0;
    // TODO add if statemant
    ctx.state.sessionMsg.url.searchParams.set("sId", id);
    ctx.state.sessionMsg.url.searchParams.set("sQty", qty);
    // if (page) {
    // ctx.state.sessionMsg.url.searchParams.set("sQty", qty);
    // ctx.state.sessionMsg.url.searchParams.set("sId", id);
    // ctx.state.sessionMsg.url.searchParams.set("sObjectId", objectId);
    // }
    // if product exist
    if (product) {
      // const object = await store.findRecord(`objects/${objectId}`);
      // const price = product.price = roundNumber(product.price * object.currencies[product.currency]);
      if (pCart) {
        if (qty) {
          // add updatedAt for control price updater
          // Dont update price!!!
          await cart.update({
            userId: ctx.from.id,
            product: {
              objectId: product.objectId,
              productId: product.id,
              qty,
              updatedAt: Math.floor(Date.now() / 1000),
            },
          });
          await ctx.answerCbQuery(`${id} = ${qty}${product.unit}, ${ctx.i18n.product.upd()}`);
        } else {
          await cart.delete({
            userId: ctx.from.id,
            objectId: product.objectId,
            productId: product.id,
          });
          await ctx.answerCbQuery(`${id}, ${ctx.i18n.product.del()}`);
        }
      } else {
        // add new product
        if (qty) {
          await cart.add({
            userId: ctx.from.id,
            fromBot: true,
            product: {
              objectId: product.objectId,
              productId: product.id,
              name: `${product.name}${product.brand ? " " + product.brand : ""}`,
              price: product.price,
              unit: product.unit,
              qty,
              createdAt: Math.floor(Date.now() / 1000),
              updatedAt: Math.floor(Date.now() / 1000),
            },
          });
          await ctx.answerCbQuery(`${id} = ${qty}${product.unit}, ${ctx.i18n.product.add()}`);
        }
      }
    } else {
      // delete not exist cart
      if (pCart) {
        await cart.delete({
          userId: ctx.from.id,
          objectId: product.objectId,
          productId: product.id,
        });
        await ctx.answerCbQuery(`${id} not exist!`);
      }
    }
    if (page) {
      parseUrl(ctx, `search/${page}`);
      await searchProductHandle(ctx, page);
      return;
    }
    if (redirectToCart) {
      parseUrl(ctx, "cart");
      await showCart(ctx);
    } else {
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
      parseUrl(ctx, sessionPathCatalog);
      await showCatalogsAction(ctx);
    }
  } else {
    return next();
  }
});
// virtual keyboard NEW
catalogsActions.push(async (ctx, next) => {
  if (ctx.state.pathParams[0] === "k") {
    let qty = ctx.state.searchParams.get("qty") || 0;
    // const changePrice = ctx.state.searchParams.get("price");
    const number = ctx.state.searchParams.get("n");
    const back = ctx.state.searchParams.get("b");
    // const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const productId = ctx.state.pathParams[1];
    const objectId = ctx.state.pathParams[2];
    const footerKeyboard = [];
    let publicImgUrl = null;
    const returnBack = ctx.state.searchParams.get("return");
    if (returnBack) {
      const page = ctx.state.sessionMsg.url.searchParams.get("page");
      const redirectToCart = ctx.state.sessionMsg.url.searchParams.get("cart");
      if (page) {
        parseUrl(ctx, `search/${page}`);
        await searchProductHandle(ctx, page);
        return;
      }
      if (redirectToCart) {
        parseUrl(ctx, "cart");
        await showCart(ctx);
      } else {
        const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
        parseUrl(ctx, sessionPathCatalog);
        await showCatalogsAction(ctx);
      }
      return;
    }
    if (objectId) {
      ctx.state.sessionMsg.url.searchParams.set("oId", objectId);
      const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
      const productCart = await store.findRecord(`carts/${ctx.from.id}/items/${objectId}-${productId}`);
      ctx.state.sessionMsg.url.searchParams.set("pName", encodeCyrillic(`${product.name}${product.brand ? " " + product.brand : ""}`));
      if (productCart) {
        ctx.state.sessionMsg.url.searchParams.set("cPrice", productCart.qty);
        qty = ctx.state.sessionMsg.url.searchParams.get("cPrice");
      }
      ctx.state.sessionMsg.url.searchParams.set("pPrice", product.price);
      ctx.state.sessionMsg.url.searchParams.set("pUnit", product.unit);
      ctx.state.sessionMsg.url.searchParams.set("pAvail", product.availability);
      ctx.state.sessionMsg.url.searchParams.set("oName", product.objectName);
      if (product.mainPhoto) {
        publicImgUrl = `photos/o/${product.objectId}/p/${product.id}/${product.mainPhoto}/2.jpg`;
      }
      // session path
      let catalogUrl = `c/${product.catalogId.substring(product.catalogId.lastIndexOf("#") + 1)}`;
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
      if (sessionPathCatalog && sessionPathCatalog.includes("?")) {
        if (sessionPathCatalog.includes("&b=1")) {
          catalogUrl = sessionPathCatalog;
        } else {
          catalogUrl = sessionPathCatalog + "&b=1";
        }
      } else {
        // ctx.state.sessionMsg.url.searchParams.set("pathC", catalogUrl);
      }
      ctx.state.sessionMsg.url.searchParams.set("pathC", catalogUrl);
      ctx.state.sessionMsg.url.searchParams.set("pathU", product.catalogId);
    }
    const productName = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
    const productPrice = + ctx.state.sessionMsg.url.searchParams.get("pPrice");
    const productUnit = ctx.state.sessionMsg.url.searchParams.get("pUnit");
    const productAvail = ctx.state.sessionMsg.url.searchParams.get("pAvail");
    const objectName = ctx.state.sessionMsg.url.searchParams.get("oName");
    ctx.state.sessionMsg.url.searchParams.set("TTL", 1);
    // use edit caption media not need
    // add number
    if (number) {
      qty += number;
    }
    // delete number
    if (back) {
      qty = qty.slice(0, -1);
    }
    // delete zerows
    qty = + qty;
    // const paramsUrl = changePrice ? `qty=${qty}&price=1` : `qty=${qty}`;
    const paramsUrl = `qty=${qty}`;
    // check max qty
    // if (!changePrice && qty > 20000) {
    //   await ctx.answerCbQuery("qty > 20000");
    //   return false;
    // }
    if (qty > 20000) {
      await ctx.answerCbQuery("qty > 20000");
      return false;
    }
    // get btn url
    const inlineKeyboard = ctx.callbackQuery.message.reply_markup.inline_keyboard;
    let urlBtn = new URL(process.env.BOT_SITE);
    inlineKeyboard.forEach((btnArray) => {
      if (btnArray[0].url) {
        urlBtn = new URL(btnArray[0].url);
      }
      // for virtual key link in second btn
      if (btnArray[1] && btnArray[1].url) {
        urlBtn = new URL(btnArray[1].url);
      }
    });
    // let msg;
    // if (changePrice) {
    //   msg = `<b>Change price in cart</b>\n${productName} (${productId}) \nNew price: ${qty.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}`;
    // } else {
    //   msg = `<b>${ctx.i18n.product.placeholderQty()}</b>\n${productName} (${productId})\n` +
    //   `<b>${ctx.i18n.product.qty()}: ${qty.toLocaleString("ru-RU")} ${productUnit}</b>\n` +
    //   `${ctx.i18n.product.price()}: ${productPrice.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY} ${ctx.state.isAdmin && productCartPrice ? `в корзине ${productCartPrice.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}` : ""}\n` +
    //   `<b>${ctx.i18n.product.sum()}: ${ctx.state.isAdmin && productCartPrice ? roundNumber(qty * productCartPrice).toLocaleString("ru-RU") : roundNumber(qty * productPrice).toLocaleString("ru-RU")} ` +
    //   `${process.env.BOT_CURRENCY}</b>`;
    // }
    const mainKeyboard = [];
    const page = ctx.state.sessionMsg.url.searchParams.get("page");
    if (page) {
      mainKeyboard.push([{text: ctx.i18n.btn.backToSearch(), callback_data: `search/${page}`}]);
    }
    // check availability
    if (productAvail === "true") {
      mainKeyboard.push([
        {text: "🔙 Назад", callback_data: `k/${productId}?return=1`},
        {text: `📦 ${productName} (${productId})`, callback_data: `p/${productId}`},
      ],
      [
        {text: "7", callback_data: `k/${productId}?n=7&${paramsUrl}`},
        {text: "8", callback_data: `k/${productId}?n=8&${paramsUrl}`},
        {text: "9", callback_data: `k/${productId}?n=9&${paramsUrl}`},
      ],
      [
        {text: "4", callback_data: `k/${productId}?n=4&${paramsUrl}`},
        {text: "5", callback_data: `k/${productId}?n=5&${paramsUrl}`},
        {text: "6", callback_data: `k/${productId}?n=6&${paramsUrl}`},
      ],
      [
        {text: "1", callback_data: `k/${productId}?n=1&${paramsUrl}`},
        {text: "2", callback_data: `k/${productId}?n=2&${paramsUrl}`},
        {text: "3", callback_data: `k/${productId}?n=3&${paramsUrl}`},
      ]);
      footerKeyboard.push([
        {text: "⬅️", callback_data: `k/${productId}?b=1&${paramsUrl}`},
        {text: "0", callback_data: `k/${productId}?n=0&${paramsUrl}`},
        {text: ctx.i18n.btn.buy(), callback_data: `a/${productId}?${paramsUrl}`},
      ]);
    } else {
      mainKeyboard.push([
        {text: `📦 ${productName} (${productId})`, callback_data: `p/${productId}`},
      ],
      [
        {text: ctx.i18n.txt.notAvailable(), callback_data: `k/${productId}`},
      ]);
    }
    if (ctx.state.sessionMsg.url.searchParams.get("cPrice")) {
      footerKeyboard.push([
        {text: ctx.i18n.btn.del(), callback_data: `a/${productId}?qty=0`},
      ]);
    }
    footerKeyboard.push([
      {text: `🏪 ${objectName}`, callback_data: `o/${objectId}`},
      {text: productName, url: `${process.env.BOT_SITE}/o/${objectId}/p/${productId}?${urlBtn.searchParams.toString()}`},
    ]);
    if (objectId) {
      const media = await photoCheckUrl(publicImgUrl);
      await ctx.editMessageMedia({
        type: "photo",
        media,
        caption: `<b>${productName} (${productId})\n` +
        `<u>${ctx.i18n.product.qty()}: ${qty.toLocaleString("ru-RU")} ${productUnit}</u>\n` +
        `${ctx.i18n.product.price()}: ${productPrice.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}\n` +
        `${ctx.i18n.product.sum()}: ${roundNumber(qty * productPrice).toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}</b>` + ctx.state.sessionMsg.linkHTML(),
        parse_mode: "html",
      }, {reply_markup: {
        inline_keyboard: [
          ...mainKeyboard,
          ...footerKeyboard,
        ],
      }});
    } else {
      await ctx.editMessageCaption(`<b>${productName} (${productId})\n` +
    `<u>${ctx.i18n.product.qty()}: ${qty.toLocaleString("ru-RU")} ${productUnit}</u>\n` +
    `${ctx.i18n.product.price()}: ${productPrice.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}\n` +
    `${ctx.i18n.product.sum()}: ${roundNumber(qty * productPrice).toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}</b>` + ctx.state.sessionMsg.linkHTML(), {
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: [
            ...mainKeyboard,
            ...footerKeyboard,
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
  if (ctx.state.pathParams[0] === "cart") {
    ctx.state.sessionMsg.url.searchParams.delete("pathU");
    ctx.state.sessionMsg.url.searchParams.delete("pathC");
    ctx.state.sessionMsg.url.searchParams.delete("s");
    ctx.state.sessionMsg.url.searchParams.delete("e");
    const clear = ctx.state.searchParams.get("clear");
    const clearOrder = ctx.state.searchParams.get("clearOrder");
    // const objectId = ctx.state.searchParams.get("o") || ctx.state.sessionMsg.url.searchParams.get("oId");
    if (clearOrder) {
      ctx.state.sessionMsg.url.searchParams.delete("orderData_id");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_objectId");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_objectName");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_orderNumber");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_lastName");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_firstName");
    }
    // clear cart
    if (clear) {
      await cart.clear(ctx.from.id);
    }
    const inlineKeyboardArray = [];
    if (ctx.state.sessionMsg.url.searchParams.get("orderData_id")) {
      inlineKeyboardArray.push([{text: `📝 Редактор заказа 🏪 ${ctx.state.sessionMsg.url.searchParams.get("orderData_objectId")}`, callback_data: "cart"}]);
    }
    inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
    // const object = await store.findRecord(`objects/${objectId}`);
    let msgTxt = `<b>${ctx.i18n.btn.cart()}</b>\n`;
    let totalQty = 0;
    let totalSum = 0;
    // let itemShow = 0;
    const products = await cart.products(ctx.from.id);
    // redirect to cart param
    ctx.state.sessionMsg.url.searchParams.set("cart", true);
    for (const [index, cartProduct] of products.entries()) {
      // check cart products price exist...
      const product = await store.findRecord(`objects/${cartProduct.objectId}/products/${cartProduct.productId}`);
      if (product && product.availability) {
        // update price in cart only for users
        const productOld = (Math.floor(Date.now() / 1000) - cartProduct.updatedAt) > 3600;
        if (!ctx.state.isAdmin && productOld && product.price !== cartProduct.price) {
          // const price = roundNumber(product.price * object.currencies[product.currency]);
          cartProduct.price = product.price;
          // products this is name field!!!
          // const products = {
          //   [product.id]: {
          //     price: product.price,
          //   },
          // };
          // await store.createRecord(`objects/${objectId}/carts/${ctx.from.id}`, {products});
          await cart.update({
            userId: ctx.from.id,
            product: {
              objectId: product.objectId,
              productId: product.id,
              price: product.price,
              updatedAt: Math.floor(Date.now() / 1000),
            },
          });
        }
        // inlineKeyboardArray.push([
        //   {text: `${index + 1}) ${cartProduct.qty.toLocaleString("ru-RU")}${product.unit}*${cartProduct.price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}=` +
        //   `${product.name} (${product.id}) ${product.brand ? product.brand : ""}-${product.objectName}`,
        //   callback_data: `p/${product.id}?o=${product.objectId}`},
        // ]);
        inlineKeyboardArray.push([
          {text: `${index + 1}) ${cartProduct.qty.toLocaleString("ru-RU")}${product.unit}*${cartProduct.price.toLocaleString("ru-RU")}${process.env.BOT_CURRENCY}=` +
          `${product.name} (${product.id}) ${product.brand ? product.brand : ""}-${product.objectName}`,
          callback_data: `k/${product.id}/${product.objectId}`},
        ]);
        totalQty += cartProduct.qty;
        totalSum += cartProduct.qty * cartProduct.price;
      } else {
        // delete product
        await cart.delete({
          userId: ctx.from.id,
          objectId: cartProduct.objectId,
          productId: cartProduct.productId,
        });
      }
    }
    if (totalQty) {
      msgTxt += `<b>${ctx.i18n.product.qty()}: ${totalQty.toLocaleString("ru-RU")}\n` +
      `${ctx.i18n.product.sum()}: ${roundNumber(totalSum).toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}</b>`;
    }
    const orderDataId = ctx.state.sessionMsg.url.searchParams.get("orderData_id");
    const orderDataOrderNumber = ctx.state.sessionMsg.url.searchParams.get("orderData_orderNumber");
    const orderDataLastName = ctx.state.sessionMsg.url.searchParams.get("orderData_lastName");
    const orderDataFirstNme = ctx.state.sessionMsg.url.searchParams.get("orderData_firstName");
    const pathOrderCurrent = ctx.state.sessionMsg.url.searchParams.get("pathOrderCurrent");
    const productsCheck = await cart.products(ctx.from.id);
    if (productsCheck.length) {
      // const orderData = await store.findRecord(`users/${ctx.from.id}`, "session.orderData");
      if (orderDataId) {
        inlineKeyboardArray.push([{text: `✅ Сохранить Заказ #${orderDataOrderNumber} от ${orderDataLastName} ` +
        `${orderDataFirstNme}`, callback_data: `e/${orderDataId}?saveProd=1`}]);
        inlineKeyboardArray.push([{text: "🏠 Вернуться к заказу", callback_data: `${pathOrderCurrent}`}]);
        // delete order from cart
        inlineKeyboardArray.push([{text: `❎ Убрать Заказ #${orderDataOrderNumber} от ${orderDataLastName} ` +
        `${orderDataFirstNme}`, callback_data: `cart?clearOrder=${orderDataId}`}]);
      }
      // create order
      inlineKeyboardArray.push([{text: ctx.i18n.btn.purchase(),
        callback_data: "w/payment"}]);
      // create pdf
      inlineKeyboardArray.push([{text: ctx.i18n.btn.savePdf(),
        callback_data: `f/cart?id=${ctx.from.id}`}]);
      inlineKeyboardArray.push([
        {text: ctx.i18n.btn.linkCart(), url: `${process.env.BOT_SITE}/share-cart/${ctx.from.id}`},
      ]);
      // clear cart
      // inlineKeyboardArray.push([{text: ctx.i18n.btn.clearCart(),
      //   callback_data: "cart?clear=1"}]);
    } else {
      if (orderDataId) {
        inlineKeyboardArray.push([{text: "🏠 Вернуться к заказу", callback_data: `${pathOrderCurrent}`}]);
        // delete order from cart
        inlineKeyboardArray.push([{text: `❎ Убрать Заказ #${orderDataOrderNumber} от ${orderDataLastName} ` +
        `${orderDataFirstNme}`, callback_data: `cart?clearOrder=${orderDataId}`}]);
      }
      inlineKeyboardArray.push([
        {text: ctx.i18n.btn.catalog(), callback_data: "c"},
      ]);
      msgTxt += ctx.i18n.txt.cartEmpty();
    }
    // Set Main menu
    // inlineKeyboardArray.push([{text: `🏪 ${object.name}`,
    //   callback_data: `o/${objectId}`}]);
    // share cart
    // if (products.length) {
    // }
    // edit message
    // let publicImgUrl = null;
    // if (object.photoId) {
    //   publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    // }
    const media = await photoCheckUrl();
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${msgTxt}</b>` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showCart);

// wizard scene
const cartWizard = [
  // show carrier services 0
  async (ctx, caption, inlineKeyboardArray = []) => {
    await ctx.editMessageCaption(`<b>${caption}:</b>` + ctx.state.sessionMsg.linkHTML(),
        {
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: inlineKeyboardArray,
          },
        });
  },
  // 1
  async (ctx, error) => {
    const inlineKeyboardArray = [];
    let qty = ctx.state.searchParams.get("qty") || 0;
    const number = ctx.state.searchParams.get("n");
    const back = ctx.state.searchParams.get("b");
    const orderId = ctx.state.searchParams.get("oId");
    const carrierId = ctx.state.searchParams.get("cId");
    // add number
    if (number) {
      qty += number;
    }
    // delete number
    if (back) {
      qty = qty.slice(0, -1);
    }
    // delete zerows
    qty = + qty;
    let paramsUrl = `qty=${qty}`;
    // add carrier ID
    if (carrierId) {
      paramsUrl += `&cId=${carrierId}`;
    }
    // TODO Maybe delete!!! this parapm???
    if (orderId) {
      paramsUrl += `&oId=${orderId}`;
    }
    inlineKeyboardArray.push([
      {text: "7", callback_data: `w/k?n=7&${paramsUrl}`},
      {text: "8", callback_data: `w/k?n=8&${paramsUrl}`},
      {text: "9", callback_data: `w/k?n=9&${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "4", callback_data: `w/k?n=4&${paramsUrl}`},
      {text: "5", callback_data: `w/k?n=5&${paramsUrl}`},
      {text: "6", callback_data: `w/k?n=6&${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "1", callback_data: `w/k?n=1&${paramsUrl}`},
      {text: "2", callback_data: `w/k?n=2&${paramsUrl}`},
      {text: "3", callback_data: `w/k?n=3&${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "⬅️", callback_data: `w/k?b=1&${paramsUrl}`},
      {text: "0️", callback_data: `w/k?n=0&${paramsUrl}`},
      {text: "Ok", callback_data: orderId ? `e/${orderId}?cN=${qty}&saveCarrier=${carrierId}` :
      `w/setCurrier?cN=${qty}&cId=${carrierId}`},
    ]);
    // edit order mode or purchase
    if (orderId) {
      inlineKeyboardArray.push([{text: "⬅️ Назад", callback_data: `r/${orderId}`}]);
    } else {
      inlineKeyboardArray.push([{text: ctx.i18n.btn.cart(), callback_data: "cart"}]);
    }
    await ctx.editMessageCaption(`${ctx.i18n.txt.carrierNumber()}:\n<b>${qty}</b>` +
      `\n${error ? `Error: ${ctx.i18n.txt.carrierNumber()}` : ""}` + ctx.state.sessionMsg.linkHTML(),
    {
      parse_mode: "html",
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
  },
  // 2
  async (ctx) => {
    // ctx.state.sessionMsg.url.searchParams.set("scene", "wizardOrder");
    ctx.state.sessionMsg.url.searchParams.set("cursor", 3);
    await store.setSession(ctx, "wizardOrder");
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.address()}</b>` + ctx.state.sessionMsg.linkHTML());
  },
  // 3
  async (ctx, address) => {
    // const address = ctx.message.text;
    ctx.state.sessionMsg.url.searchParams.set("address", address);
    ctx.state.sessionMsg.url.searchParams.set("cursor", 4);
    await store.setSession(ctx, "wizardOrder");
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.lastName()}</b>` + ctx.state.sessionMsg.linkHTML());
  },
  // 4
  async (ctx, lastName) => {
    ctx.state.sessionMsg.url.searchParams.set("lastName", lastName);
    // reply first name
    ctx.state.sessionMsg.url.searchParams.set("cursor", 5);
    await store.setSession(ctx, "wizardOrder");
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.firstName()}</b>` + ctx.state.sessionMsg.linkHTML());
  },
  // 5
  async (ctx, firstName) => {
    // const firstName = ctx.message.text;
    ctx.state.sessionMsg.url.searchParams.set("firstName", firstName);
    ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
    await store.setSession(ctx, "wizardOrder");
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.phoneNumber()} ${process.env.BOT_PHONETEMPLATE}</b>` + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        keyboard: [
          [{
            text: "Отправить свой номер",
            request_contact: true,
          }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  },
  // 6
  async (ctx, phoneNumberText) => {
    // const phoneNumberText = (ctx.message.contact && ctx.message.contact.phone_number) || ctx.message.text;
    const regexpPhoneRu = new RegExp(process.env.BOT_PHONEREGEXP);
    phoneNumberText = phoneNumberText.replace(/\s/g, "");
    const checkPhone = phoneNumberText.match(regexpPhoneRu);
    // check phone number
    if (!checkPhone) {
      await ctx.replyWithHTML(`Error use format: ${ctx.i18n.txt.phoneNumber()} ${process.env.BOT_PHONETEMPLATE}` + ctx.state.sessionMsg.linkHTML());
      return;
    }
    const phoneNumber = `${process.env.BOT_PHONECODE}${checkPhone[2]}`;
    ctx.state.sessionMsg.url.searchParams.set("phoneNumber", phoneNumber);
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: ctx.i18n.btn.proceed(), callback_data: "w/setNoComment"}]);
    inlineKeyboard.push([{text: ctx.i18n.btn.addComment(), callback_data: "w/setComment"}]);
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.enterComment()}</b>` + ctx.state.sessionMsg.linkHTML(),
        {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          }});
  },
  // 7
  async (ctx, comment) => {
    if (comment) {
      ctx.state.sessionMsg.url.searchParams.set("comment", comment);
    }
    // get preorder data
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: ctx.i18n.btn.purchaseConfirm(), callback_data: "w/createOrder"}]);
    const preOrderData = ctx.state.sessionMsg.url.searchParams;
    const msg = `<b>${ctx.i18n.txt.check()}:</b>\n` +
    `${preOrderData.get("lastName")} ${preOrderData.get("firstName")} ${preOrderData.get("phoneNumber")}\n` +
    `${preOrderData.get("address")}\n` +
    `Доставка: ${store.carriers().get(+ preOrderData.get("carrierId")).name} ` +
    `${preOrderData.get("carrierNumber") ? "#" + preOrderData.get("carrierNumber") : ""}\n` +
    `Оплата: ${store.payments().get(+ preOrderData.get("paymentId"))}\n` +
    `${preOrderData.get("comment") ? `${ctx.i18n.txt.comment()}: ${preOrderData.get("comment")}` : ""}` + ctx.state.sessionMsg.linkHTML();
    // TODO not delete msq if no comment
    if (comment) {
      await ctx.replyWithHTML(msg,
          {
            reply_markup: {
              inline_keyboard: inlineKeyboard,
            }});
    } else {
      await ctx.editMessageText(msg,
          {
            parse_mode: "html",
            reply_markup: {
              inline_keyboard: inlineKeyboard,
            },
          });
    }
  },
];

// save order final
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.pathParams[0] === "w") {
    const todo = ctx.state.pathParams[1];
    // order payment method
    if (todo === "payment") {
      // show paymets service
      const inlineKeyboardArray = [];
      store.payments().forEach((value, key) => {
        inlineKeyboardArray.push([{text: value, callback_data: `w/carrier?paymentId=${key}`}]);
      });
      inlineKeyboardArray.push([{text: ctx.i18n.btn.cart(), callback_data: "cart"}]);
      await cartWizard[0](ctx, "Оплата", inlineKeyboardArray);
    }
    // show carrier
    if (todo === "carrier") {
      // save payment
      const paymentId = + ctx.state.searchParams.get("paymentId");
      ctx.state.sessionMsg.url.searchParams.set("paymentId", paymentId);
      const inlineKeyboardArray = [];
      store.carriers().forEach((obj, key) => {
        if (obj.reqNumber) {
          inlineKeyboardArray.push([{text: obj.name, callback_data: `w/k?cId=${key}`}]);
        } else {
          inlineKeyboardArray.push([{text: obj.name, callback_data: `w/wizard?cId=${key}`}]);
        }
      });
      inlineKeyboardArray.push([{text: ctx.i18n.btn.cart(), callback_data: "cart"}]);
      await cartWizard[0](ctx, "Доставка", inlineKeyboardArray);
    }
    // set carrier number by virt keyboard
    if (todo === "k") {
      await cartWizard[1](ctx);
    }
    if (todo === "setCurrier") {
      const carrierId = + ctx.state.searchParams.get("cId");
      const carrierNumber = + ctx.state.searchParams.get("cN");
      ctx.state.sessionMsg.url.searchParams.set("carrierId", carrierId);
      if (carrierNumber) {
        ctx.state.sessionMsg.url.searchParams.set("carrierNumber", carrierNumber);
      } else {
        await cartWizard[1](ctx, "errorCurrierNumber");
        return;
      }
      await ctx.deleteMessage();
      await cartWizard[2](ctx);
    }
    // save payment and goto wizard
    if (todo === "wizard") {
      const carrierId = + ctx.state.searchParams.get("cId");
      // test save msg session
      ctx.state.sessionMsg.url.searchParams.set("carrierId", carrierId);
      await ctx.deleteMessage();
      await cartWizard[2](ctx);
    }
    // save last name user
    // if (todo === "setCurrentLastName") {
    //   await ctx.deleteMessage();
    //   await cartWizard[4](ctx, ctx.from.last_name);
    // }
    // save custom last name
    // if (todo === "setLastName") {
    //   await ctx.deleteMessage();
    //   ctx.state.sessionMsg.url.searchParams.set("cursor", 4);
    //   await store.createRecord(`users/${ctx.from.id}`, {
    //     scene: "wizardOrder",
    //     searchParams: ctx.state.sessionMsg.url.searchParams.toString(),
    //   });
    //   await ctx.replyWithHTML("<b>Введите фамилию получателя</b>" + ctx.state.sessionMsg.linkHTML());
    // }
    // save last name user
    // if (todo === "setCurrentFirstName") {
    //   await ctx.deleteMessage();
    //   await cartWizard[5](ctx, ctx.from.first_name);
    // }
    // save custom last name
    // if (todo === "setFirstName") {
    //   await ctx.deleteMessage();
    //   ctx.state.sessionMsg.url.searchParams.set("cursor", 5);
    //   await store.createRecord(`users/${ctx.from.id}`, {
    //     scene: "wizardOrder",
    //     searchParams: ctx.state.sessionMsg.url.searchParams.toString(),
    //   });
    //   await ctx.replyWithHTML("<b>Введите имя получателя</b>" + ctx.state.sessionMsg.linkHTML());
    // }
    // save phone number
    // if (todo === "setCurrentPhoneNumber") {
    //   await ctx.deleteMessage();
    //   ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
    //   await store.createRecord(`users/${ctx.from.id}`, {
    //     scene: "wizardOrder",
    //     searchParams: ctx.state.sessionMsg.url.searchParams.toString(),
    //   });
    //   await ctx.replyWithHTML("Нажмите кнопку Отправить свой номер" + ctx.state.sessionMsg.linkHTML(), {
    //     reply_markup: {
    //       keyboard: [
    //         [{
    //           text: "Отправить свой номер",
    //           request_contact: true,
    //         }],
    //         [{text: "Отмена"}],
    //       ],
    //       resize_keyboard: true,
    //       one_time_keyboard: true,
    //     },
    //   });
    // }
    // if (todo === "setPhoneNumber") {
    //   await ctx.deleteMessage();
    //   ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
    //   await store.createRecord(`users/${ctx.from.id}`, {
    //     scene: "wizardOrder",
    //     searchParams: ctx.state.sessionMsg.url.searchParams.toString(),
    //   });
    //   await ctx.replyWithHTML("Введите номер телефона" + ctx.state.sessionMsg.linkHTML());
    // }
    // set comment
    if (todo === "setComment") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 7);
      await store.setSession(ctx, "wizardOrder");
      await ctx.replyWithHTML(`<b>${ctx.i18n.txt.enterComment()}</b>` + ctx.state.sessionMsg.linkHTML());
    }
    if (todo === "setNoComment") {
      // await ctx.deleteMessage();
      await cartWizard[7](ctx);
    }
    // create order
    if (todo === "createOrder") {
      const preOrderData = ctx.state.sessionMsg.url.searchParams;
      const wizardData = {
        "lastName": preOrderData.get("lastName"),
        "firstName": preOrderData.get("firstName"),
        "phoneNumber": preOrderData.get("phoneNumber"),
        "address": preOrderData.get("address"),
        "carrierId": + preOrderData.get("carrierId"),
        "paymentId": + preOrderData.get("paymentId"),
        "fromBot": true,
        "auth": true,
      };
      if (preOrderData.get("carrierNumber")) {
        wizardData["carrierNumber"] = + preOrderData.get("carrierNumber");
      }
      if (preOrderData.get("comment")) {
        wizardData["comment"] = preOrderData.get("comment");
      }
      // save orders
      try {
        const ordersInfo = await cart.createOrder(ctx.from.id, wizardData);
        let htmlLinks = "";
        for (const shareOrder of ordersInfo) {
          htmlLinks += `${ctx.i18n.txt.order()} #${shareOrder.orderNumber} склад ${shareOrder.objectName}\n` +
          `${process.env.BOT_SITE}/o/${shareOrder.objectId}/s/${shareOrder.orderId}\n`;
        }
        await ctx.deleteMessage();
        // clear session var
        await store.defaultSession(ctx);
        await ctx.reply(`${htmlLinks + ctx.i18n.txt.confirm()} /catalogs`, {
          reply_markup: {
            remove_keyboard: true,
          }});
      } catch (error) {
        // await ctx.reply(`${error}`);
        await ctx.answerCbQuery(`${error}`);
        return;
      }
    }
    if (todo === "cancelOrder") {
      await ctx.deleteMessage();
      await ctx.reply("Commands /catalogs");
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// show tags
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.pathParams[0] === "t") {
    const inlineKeyboardArray = [];
    const catalogId = ctx.state.pathParams[1];
    const pathUrl = ctx.state.sessionMsg.url.searchParams.get("pathU");
    // const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    // const object = await store.findRecord(`objects/${objectId}`);
    const catalog = await store.findRecord(`catalogs/${pathUrl}`);
    let catalogUrl = `c/${catalogId}`;
    const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
    if (sessionPathCatalog) {
      catalogUrl = sessionPathCatalog;
    }
    inlineKeyboardArray.push([{text: `⤴️ ${catalog.name}`,
      callback_data: catalogUrl}]);
    // get algolia tags
    const pathNames = catalog.pathArray.map((catalog) => catalog.name);
    const tags = await algoliaIndexProducts.search("", {
      hitsPerPage: 0,
      facets: ["subCategory"],
      facetFilters: [[`categories.lvl${pathNames.length - 1}:${pathNames.join(" > ")}`]],
    });
    const urlBtn = new URL(`${process.env.BOT_SITE}/c/${pathUrl.replace(/#/g, "/")}`);
    for (const [index, tag] of Object.entries(tags.facets.subCategory || {}).entries()) {
      // add session data encoded
      urlBtn.searchParams.append("sessionTag", encodeCyrillic(tag[0]));
      if (index == ctx.state.searchParams.get("tS")) {
        inlineKeyboardArray.push([{text: `✅ ${tag[0]} (${tag[1]})`, callback_data: `c/${catalogId}?t=${index}`}]);
      } else {
        inlineKeyboardArray.push([{text: `🎚 ${tag[0]} (${tag[1]})`, callback_data: `c/${catalogId}?t=${index}`}]);
      }
    }
    inlineKeyboardArray.push([{text: catalog.name, url: urlBtn.href}]);
    const media = await photoCheckUrl();
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${ctx.i18n.btn.filter()}</b>` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// show photos
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.pathParams[0] === "s") {
    const productId = ctx.state.pathParams[1];
    // const pId = ctx.state.searchParams.get("pId");
    const photoId = ctx.state.sessionMsg.url.searchParams.get("photoId");
    const todo = ctx.state.searchParams.get("todo");
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    // set main photo
    if (todo === "main") {
      await store.updateRecord(`objects/${objectId}/products/${productId}`, {
        mainPhoto: photoId,
      });
      await ctx.editMessageCaption(`Main photo updated ${productId}`+ ctx.state.sessionMsg.linkHTML(),
          {
            reply_markup: {
              inline_keyboard: [
                [{text: "🗑 Delete", callback_data: `s/${productId}?todo=delete`}],
                [{text: ctx.i18n.btn.close(), callback_data: `s/${productId}?todo=close`}],
              ],
            },
            parse_mode: "html",
          });
      return;
    }
    // close photo
    if (todo === "close") {
      await ctx.deleteMessage();
      return;
    }
    const productRef = getFirestore().collection("objects").doc(objectId)
        .collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    // delete photo
    if (todo === "delete") {
      // if delete main Photo
      if (productSnapshot.data().mainPhoto === photoId) {
        // set new main photo index 1 or delete
        if (productSnapshot.data().photos && productSnapshot.data().photos.length > 1) {
          for (const photosId of productSnapshot.data().photos) {
            if (photosId !== photoId) {
              await productRef.update({
                mainPhoto: photosId,
                photos: FieldValue.arrayRemove(photoId),
              });
              break;
            }
          }
        } else {
          await productRef.update({
            mainPhoto: FieldValue.delete(),
            photos: FieldValue.arrayRemove(photoId),
          });
        }
      } else {
        await productRef.update({
          photos: FieldValue.arrayRemove(photoId),
        });
      }
      // delete photos from bucket
      await deletePhotoStorage(`photos/o/${objectId}/p/${productId}/${photoId}`);
      await ctx.deleteMessage();
      return;
    }
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    ctx.state.sessionMsg.url.searchParams.delete("photoId");
    for (const [index, photoId] of product.photos.entries()) {
      const inlineKeyboardArray = [];
      // if admin
      if (ctx.state.isAdmin) {
        ctx.state.sessionMsg.url.searchParams.set("photoId", photoId);
        if (product.mainPhoto !== photoId) {
          inlineKeyboardArray.push([{text: "🏷 Set main",
            callback_data: `s/${product.id}?todo=main`}]);
        }
        inlineKeyboardArray.push([{text: "🗑 Delete",
          callback_data: `s/${product.id}?todo=delete`}]);
      }
      inlineKeyboardArray.push([{text: ctx.i18n.btn.close(), callback_data: `s/${product.id}?todo=close`}]);
      let caption = `<b>Фото #${index + 1}</b> ${product.name} (${product.id})`;
      if (product.mainPhoto === photoId) {
        caption = "✅ " + caption;
      }
      const media = await photoCheckUrl(`photos/o/${objectId}/p/${product.id}/${photoId}/2.jpg`);
      await ctx.replyWithPhoto(media, {
        caption: caption + ctx.state.sessionMsg.linkHTML(),
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        },
      });
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// upload photos
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.pathParams[0] === "u") {
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const pathUrl = ctx.state.sessionMsg.url.searchParams.get("pathU");
    // ctx.state.sessionMsg.url.searchParams.set("scene", `upload-${todo}`);
    const paramId = ctx.state.pathParams[1];
    const todo = ctx.state.pathParams[2];
    const field = ctx.state.pathParams[3];
    let caption;
    if (todo === "prod") {
      ctx.state.sessionMsg.url.searchParams.set("upload-productId", paramId);
      caption = `Добавьте фото товара <b>${paramId}</b>`;
    }
    if (todo === "cat") {
      ctx.state.sessionMsg.url.searchParams.set("upload-catalogId", pathUrl);
      // const catalog = await store.findRecord(`objects/${objectId}/catalogs/${pathUrl}`);
      caption = `Добавьте фото каталога <b>${pathUrl}</b>`;
    }
    if (todo === "obj") {
      // const object = await store.findRecord(`objects/${paramId}`);
      caption = `Добавьте фото склада <b>${objectId}</b>`;
    }
    // edit catalog
    if (todo === "eCat") {
      // const currentCatalog = await store.findRecord(`catalogs/${pathUrl}`);
      ctx.state.sessionMsg.url.searchParams.set("upload-catalogId", pathUrl);
      ctx.state.sessionMsg.url.searchParams.set("field", field);
      caption = `<b>${pathUrl}</b>\nИзменить поле <b>${field}</b>\n\nUse <b>del</b> for delete`;
    }
    // if (todo === "postId") {
    //   ctx.state.sessionMsg.url.searchParams.set("upload-catalogId", pathUrl);
    //   caption = `Добавьте postId, del удалить <b>${pathUrl}</b>`;
    // }
    await store.setSession(ctx, `upload-${todo}`);
    await ctx.replyWithHTML(caption + ctx.state.sessionMsg.linkHTML());
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// change product data
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.pathParams[0] === "b") {
    ctx.state.sessionMsg.url.searchParams.set("TTL", 1);
    // const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    // const productName = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
    // const price = ctx.state.sessionMsg.url.searchParams.get("ePrice");
    // const purchasePrice = ctx.state.sessionMsg.url.searchParams.get("ePurchase");
    // const productCurrency = ctx.state.sessionMsg.url.searchParams.get("eCurrency");
    // ctx.state.sessionMsg.url.searchParams.set("scene", "changeProduct");
    const productId = ctx.state.pathParams[1];
    const todo = ctx.state.pathParams[2];
    const column = ctx.state.pathParams[3];
    ctx.state.sessionMsg.url.searchParams.set("cTodo", todo);
    ctx.state.sessionMsg.url.searchParams.set("cColumn", column);
    ctx.state.sessionMsg.url.searchParams.set("cPId", productId);
    await store.setSession(ctx, "changeProduct");
    if (todo === "del") {
      // first exit from product
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
      parseUrl(ctx, sessionPathCatalog ? sessionPathCatalog : "c");
      await showCatalogs(ctx);
      await ctx.replyWithHTML(`<b>${productId}</b>\n` +
      `Введите <b>${todo}</b> для подтверждения удаления` + ctx.state.sessionMsg.linkHTML());
    } else {
      // const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
      await ctx.replyWithHTML(`<b>${productId}</b>\n` +
      `Изменить поле <b>${todo}</b>\n` +
      // `Значение поля <b>${todo}</b>: ${product[todo]}\n` +
      // `Закупочная цена (purchasePrice) <b>${purchasePrice.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}</b>\n` +
      // `Продажная цена (price) <b>${price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}</b>\n`+
      "Use <b>del</b> for delete desc\n" +
      "Наличие товара: <code>true</code> or <code>false</code>" + ctx.state.sessionMsg.linkHTML());
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// change cart product price deprecate!!!
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.pathParams[0] === "x") {
    ctx.state.sessionMsg.url.searchParams.set("TTL", 0);
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const id = ctx.state.pathParams[1];
    const price = + ctx.state.searchParams.get("qty") || 0;
    const name = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
    const redirectToCart = ctx.state.sessionMsg.url.searchParams.get("cart");
    const page = ctx.state.sessionMsg.url.searchParams.get("page");
    if (price) {
      await cart.update({
        userId: ctx.from.id,
        product: {
          objectId,
          productId: id,
          price,
          updatedAt: Math.floor(Date.now() / 1000),
        },
      });
      await ctx.answerCbQuery(`${name} (${id}) New price set ${price}`);
    } else {
      await ctx.answerCbQuery("price > 0");
      return;
    }
    if (page) {
      parseUrl(ctx, `search/${page}`);
      await searchProductHandle(ctx);
      return;
    }
    if (redirectToCart) {
      parseUrl(ctx, "cart");
      await showCart(ctx);
    } else {
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
      parseUrl(ctx, sessionPathCatalog ? sessionPathCatalog : "c");
      await showCatalogs(ctx);
    }
  } else {
    return next();
  }
});

// show catalogs New
const showCatalogs = async (ctx) => {
  const inlineKeyboardArray = [];
  // get all catalogs
  const catalogsSnapshot = await getFirestore().collection("catalogs").where("parentId", "==", null).orderBy("orderNumber").get();
  catalogsSnapshot.docs.forEach((doc) => {
    inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id.substring(doc.id.lastIndexOf("#") + 1)}?in=1`}]);
  });
  // add main photo
  const projectImg = await photoCheckUrl();
  await ctx.replyWithPhoto(projectImg,
      {
        caption: `<b>${ctx.i18n.btn.catalog()}</b>`,
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        },
      });
};

// show catalogs actions New
const showCatalogsAction = async (ctx, next) => {
  if (ctx.state.pathParams[0] === "c") {
    // get btn url
    const inlineKeyboard = ctx.callbackQuery.message.reply_markup.inline_keyboard;
    let urlBtn = new URL(process.env.BOT_SITE);
    inlineKeyboard.forEach((btnArray) => {
      if (btnArray[0].url) {
        urlBtn = new URL(btnArray[0].url);
      }
      // for virtual key link in second btn
      if (btnArray[1] && btnArray[1].url) {
        urlBtn = new URL(btnArray[1].url);
      }
    });
    let catalogId = ctx.state.pathParams[1];
    const tag = ctx.state.searchParams.get("t");
    const sessionTag = urlBtn.searchParams.getAll("sessionTag")[tag];
    const tagName = sessionTag && encodeCyrillic(sessionTag, true) || null;
    const back = ctx.state.searchParams.get("b");
    const objectIdE = ctx.state.sessionMsg.url.searchParams.get("objIdE");
    const objectIdS = ctx.state.sessionMsg.url.searchParams.get("objIdS");
    const startAfter = ctx.state.searchParams.get("s");
    const endBefore = ctx.state.searchParams.get("e");
    const upCatalog = ctx.state.searchParams.get("up");
    const inCatalog = ctx.state.searchParams.get("in");
    let publicImgUrl = null;
    const inlineKeyboardArray =[];
    if (ctx.state.sessionMsg.url.searchParams.get("orderData_id")) {
      inlineKeyboardArray.push([{text: `📝 Редактор заказа 🏪 ${ctx.state.sessionMsg.url.searchParams.get("orderData_objectId")}`, callback_data: "cart"}]);
    }
    const pathC = ctx.callbackQuery.data.replace("?up=1", "").replace("?in=1", "");
    ctx.state.sessionMsg.url.searchParams.set("pathC", pathC);
    ctx.state.sessionMsg.url.searchParams.delete("cart");
    let currentCatalog;
    if (catalogId) {
      const pathUrl = ctx.state.sessionMsg.url.searchParams.get("pathU") || "";
      if (upCatalog) {
        // clear last cat
        catalogId = pathUrl.split(/#[a-zA-Z0-9-_]+$/)[0];
      } else if (inCatalog) {
        catalogId = `${pathUrl ? `${pathUrl}#` : ""}${catalogId}`;
      } else {
        catalogId = pathUrl;
      }
      ctx.state.sessionMsg.url.searchParams.set("pathU", catalogId);
      currentCatalog = await store.findRecord(`catalogs/${catalogId}`);
      if (!currentCatalog) {
        await ctx.answerCbQuery("Catalog not found");
        return;
      }
      // back button
      inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"},
        {text: "🔙 Назад",
          callback_data: currentCatalog.parentId ? `c/${currentCatalog.parentId.substring(currentCatalog.parentId.lastIndexOf("#") + 1)}?up=1` : "c"}]);
      if (ctx.state.isAdmin && ctx.state.sessionMsg.url.searchParams.get("editMode")) {
        inlineKeyboardArray.push([{text: `📸 Загрузить фото каталога ${currentCatalog.name}`,
          callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/cat`}]);
        if (process.env.BOT_LANG === "uk") {
          inlineKeyboardArray.push([{text: `📖 Опис Uk ${currentCatalog.desc ? "✅" : "🚫"}`,
            callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/eCat/desc`}]);
          inlineKeyboardArray.push([{text: `📖 meta description Uk ${currentCatalog.siteDesc ? "✅" : "🚫"}`,
            callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/eCat/siteDesc`}]);
          inlineKeyboardArray.push([{text: `📖 Описание Ru ${currentCatalog.descRu ? "✅" : "🚫"}`,
            callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/eCat/descRu`}]);
          inlineKeyboardArray.push([{text: `📖 meta description Ru ${currentCatalog.siteDescRu ? "✅" : "🚫"}`,
            callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/eCat/siteDescRu`}]);
          inlineKeyboardArray.push([{text: `📖 siteTitle Uk ${currentCatalog.siteTitle ? "✅" : "🚫"}`,
            callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/eCat/siteTitle`}]);
          inlineKeyboardArray.push([{text: `📖 siteTitle Ru ${currentCatalog.siteTitleRu ? "✅" : "🚫"}`,
            callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/eCat/siteTitleRu`}]);
        } else {
          inlineKeyboardArray.push([{text: `📖 Описание каталога ${currentCatalog.desc ? "✅" : "🚫"}`,
            callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/eCat/desc`}]);
          inlineKeyboardArray.push([{text: `📖 meta description ${currentCatalog.siteDesc ? "✅" : "🚫"}`,
            callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/eCat/siteDesc`}]);
          inlineKeyboardArray.push([{text: `📖 siteTitle ${currentCatalog.siteTitle ? "✅" : "🚫"}`,
            callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}/eCat/siteTitle`}]);
        }
        // inlineKeyboardArray.push([{text: `📖 PostId ${currentCatalog.name}`,
        //   callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?todo=postId`}]);
      }
      // products query with collectionGroup
      let mainQuery = getFirestore().collectionGroup("products").where("catalogId", "==", currentCatalog.id).orderBy("orderNumber");
      // when edit order products filter by seller
      if (ctx.state.sessionMsg.url.searchParams.get("orderData_objectId")) {
        mainQuery = mainQuery.where("objectId", "==", ctx.state.sessionMsg.url.searchParams.get("orderData_objectId"));
      }
      // Filter by tag
      let tagUrl = "";
      if (tagName) {
        mainQuery = mainQuery.where("tags", "array-contains", tagName);
        tagUrl = `&t=${tag}`;
      }
      // show catalog siblings, get catalogs snap index or siblings
      const catalogsSnapshot = await getFirestore().collection("catalogs").where("parentId", "==", catalogId).orderBy("orderNumber").get();
      catalogsSnapshot.docs.forEach((doc) => {
        inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id.substring(doc.id.lastIndexOf("#") + 1)}?in=1`}]);
      });
      // paginate goods, copy main query
      let query = mainQuery;
      if (startAfter) {
        // get session
        const startAfterSession = back ? ctx.state.sessionMsg.url.searchParams.get("sPrev") : ctx.state.sessionMsg.url.searchParams.get("s");
        // for back btn
        ctx.state.sessionMsg.url.searchParams.set("sPrev", startAfterSession);
        const startAfterProduct = await getFirestore().collection("objects").doc(objectIdS).collection("products").doc(startAfterSession).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeSession = back ? ctx.state.sessionMsg.url.searchParams.get("ePrev") : ctx.state.sessionMsg.url.searchParams.get("e");
        ctx.state.sessionMsg.url.searchParams.set("ePrev", endBeforeSession);
        const endBeforeProduct = await getFirestore().collection("objects").doc(objectIdE).collection("products").doc(endBeforeSession).get();
        query = query.endBefore(endBeforeProduct).limitToLast(10);
      } else {
        query = query.limit(10);
      }
      // get products
      const productsSnapshot = await query.get();
      // get products tags
      if (!productsSnapshot.empty && catalogsSnapshot.empty) {
        const tagsArray = [];
        tagsArray.push({text: ctx.i18n.btn.filter(),
          callback_data: `t/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}`});
        // Delete or close selected tag
        if (tag) {
          tagsArray[0].callback_data = `t/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?tS=${tag}`;
          tagsArray.push({text: `❎ ${tagName}`, callback_data: `c/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}`});
        }
        inlineKeyboardArray.push(tagsArray);
      }
      // get cart product
      // const cartProductsArray = await store.findRecord(`carts/${ctx.from.id}`, "products");
      const productAddedId = ctx.state.sessionMsg.url.searchParams.get("sId");
      const productAddedQty = + ctx.state.sessionMsg.url.searchParams.get("sQty");
      // generate products array
      for (const product of productsSnapshot.docs) {
        const btnProduct = [];
        // service new
        if (product.data().phone) {
          btnProduct.push({text: `${product.data().availability ? "🧑‍🔧" : "🚫"} ${product.data().price.toLocaleString("ru-RU")}` +
          `${process.env.BOT_CURRENCY} ${product.data().name} (${product.id}) ${product.data().brand ? product.data().brand : ""}`,
          callback_data: `p/${product.id}/${product.data().objectId}`});
        } else {
          btnProduct.push({text: `${product.data().availability ? "📦" : "🚫"} ${product.data().price.toLocaleString("ru-RU")}` +
          `${process.env.BOT_CURRENCY} ${product.data().name} (${product.id}) ${product.data().brand ? product.data().brand : ""}`,
          callback_data: `k/${product.id}/${product.data().objectId}`});
        }
        // get cart products
        // const cartProduct = cartProductsArray && cartProductsArray[product.id];
        // if (cartProduct) {
        //   addButton.text = `🛒${cartProduct.qty}${cartProduct.unit} ` +
        //   `${roundNumber(cartProduct.price * cartProduct.qty).toLocaleString("ru-RU")} ` +
        //   `${process.env.BOT_CURRENCY} ${product.data().name} (${product.id}) ${product.data().brand ? product.data().brand : ""}`;
        //   addButton.callback_data = `p/${product.id}?o=${product.data().objectId}`;
        // }
        if (productAddedId === product.id && productAddedQty) {
          btnProduct.push({
            text: `🛒 + ${productAddedQty}`,
            callback_data: "cart",
          });
        }
        inlineKeyboardArray.push(btnProduct);
      }
      // Set load more button
      if (!productsSnapshot.empty) {
        const prevNext = [];
        // endBefore prev button e paaram
        const endBeforeSnap = productsSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          // set session
          ctx.state.sessionMsg.url.searchParams.set("e", endBeforeSnap.id);
          ctx.state.sessionMsg.url.searchParams.set("objIdE", endBeforeSnap.data().objectId);
          prevNext.push({text: ctx.i18n.btn.previous(),
            callback_data: `c/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?e=1${tagUrl}`});
        }
        // startAfter
        const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          // set session
          ctx.state.sessionMsg.url.searchParams.set("s", startAfterSnap.id);
          ctx.state.sessionMsg.url.searchParams.set("objIdS", startAfterSnap.data().objectId);
          prevNext.push({text: ctx.i18n.btn.next(),
            callback_data: `c/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?s=1${tagUrl}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
      // get photo catalog
      if (currentCatalog.photoId) {
        publicImgUrl = `photos/c/${currentCatalog.id.replace(/#/g, "-")}/${currentCatalog.photoId}/2.jpg`;
      }
    } else {
      ctx.state.sessionMsg.url.searchParams.delete("pathU");
      inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
      const catalogsSnapshot = await getFirestore().collection("catalogs").where("parentId", "==", null).orderBy("orderNumber").get();
      catalogsSnapshot.docs.forEach((doc) => {
        inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id}?in=1`}]);
      });
    }
    // session btn not delete!!!
    inlineKeyboardArray.push([
      {
        text: `${catalogId ? currentCatalog.name : ctx.i18n.btn.catalog()}`,
        url: `${process.env.BOT_SITE}/c${catalogId ? "/" + catalogId.replace(/#/g, "/") : ""}?${urlBtn.searchParams.toString()}`,
      },
    ]);
    // render
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${currentCatalog && currentCatalog.pathArray ? `${ctx.i18n.btn.catalog()} > ${currentCatalog.pathArray.map((cat) => cat.name).join(" > ")}` : ctx.i18n.btn.catalog()}</b>` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};

catalogsActions.push(showCatalogsAction);

exports.catalogsActions = catalogsActions;
exports.cartWizard = cartWizard;
exports.showCart = showCart;
exports.showCatalogs = showCatalogs;
