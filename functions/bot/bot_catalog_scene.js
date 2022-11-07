const firebase = require("firebase-admin");
const firestore = require("firebase-admin/firestore");
const {cart, store, roundNumber, photoCheckUrl, deletePhotoStorage} = require("./bot_store_cart");
const {searchProductHandle, algoliaIndexProducts} = require("./bot_search");
const {parseUrl} = require("./bot_start_scene");
const Translit = require("cyrillic-to-translit-js");
const cyrillicToTranslit = new Translit();
const cyrillicToTranslitUk = new Translit({preset: "uk"});
// catalogs actions array
const catalogsActions = [];
// show catalogs and goods
const showCatalog = async (ctx, next) => {
  if (ctx.state.routeName === "c") {
    // const objectId = ctx.state.params.get("o");
    // const objectId = ctx.state.sessionMsg.url.searchParams.get("objectId");
    const objectIdSession = ctx.state.sessionMsg.url.searchParams.get("objectId");
    const objectId = ctx.state.params.get("o") || objectIdSession;
    if (ctx.state.params.get("o")) {
      ctx.state.sessionMsg.url.searchParams.set("objectId", objectId);
    }
    // delete search redirect!
    ctx.state.sessionMsg.url.searchParams.delete("page");
    const cartButtons = await cart.cartButtons(objectId, ctx);
    const catalogId = ctx.state.param;
    const tag = ctx.state.params.get("t");
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    let publicImgUrl = null;
    const object = await store.findRecord(`objects/${objectId}`);
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    // and show upload catalog photo
    // let uUrl = "";
    const inlineKeyboardArray =[];
    // ctx.session.pathCatalog = ctx.callbackQuery.data;
    // save to fire session
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"pathCatalog": ctx.callbackQuery.data}});
    ctx.state.sessionMsg.url.searchParams.set("pathCatalog", ctx.callbackQuery.data);
    ctx.state.sessionMsg.url.searchParams.delete("cart");
    let currentCatalog;
    if (catalogId) {
      currentCatalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
      // back button
      inlineKeyboardArray.push([{text: `⤴️ ${currentCatalog.pathArray.length > 1 ? currentCatalog.pathArray[currentCatalog.pathArray.length - 2].name : "Каталог"}`,
        callback_data: currentCatalog.parentId ? `c/${currentCatalog.parentId}` : "c"}]);
      if (ctx.state.isAdmin && ctx.state.sessionMsg.url.searchParams.get("editMode")) {
        inlineKeyboardArray.push([{text: `📸 Загрузить фото каталога ${currentCatalog.name}`,
          callback_data: `u/${currentCatalog.id}?todo=cat`}]);
      }
      // products query
      let mainQuery = firebase.firestore().collection("objects").doc(objectId)
          .collection("products").where("catalogId", "==", currentCatalog.id)
          .orderBy("orderNumber");
      // Filter by tag
      let tagUrl = "";
      if (tag) {
        mainQuery = mainQuery.where("tags", "array-contains", tag);
        tagUrl = `&t=${tag}`;
      }
      // show catalog siblings, get catalogs snap index or siblings
      const catalogsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
          .collection("catalogs")
          .where("parentId", "==", catalogId).orderBy("orderNumber").get();
      catalogsSnapshot.docs.forEach((doc) => {
        inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id}`}]);
      });
      // paginate goods, copy main query
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
      // get products
      const productsSnapshot = await query.get();
      // get products tags
      if (!productsSnapshot.empty && catalogsSnapshot.empty) {
        const tagsArray = [];
        tagsArray.push({text: ctx.i18n.btn.filter(),
          callback_data: `t/${currentCatalog.id}`});
        // Delete or close selected tag
        if (tag) {
          tagsArray[0].callback_data = `t/${currentCatalog.id}?tS=${tag}`;
          tagsArray.push({text: `❎ ${tag}`, callback_data: `c/${currentCatalog.id}`});
        }
        inlineKeyboardArray.push(tagsArray);
      }
      // get cart product
      const cartProductsArray = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products");
      // generate products array
      for (const product of productsSnapshot.docs) {
        const addButton = {text: `📦 ${roundNumber(product.data().price * object.currencies[product.data().currency])}` +
        `${process.env.BOT_CURRENCY} ${product.data().name} (${product.id})`,
        callback_data: `p/${product.id}`};
        // get cart products
        const cartProduct = cartProductsArray && cartProductsArray[product.id];
        if (cartProduct) {
          addButton.text = `🛒${cartProduct.qty}${cartProduct.unit} ` +
          `${roundNumber(cartProduct.price * cartProduct.qty)} ` +
          `${process.env.BOT_CURRENCY} ${product.data().name} (${product.id})`;
          addButton.callback_data = `p/${product.id}`;
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
          prevNext.push({text: ctx.i18n.btn.previous(),
            callback_data: `c/${currentCatalog.id}?e=${endBeforeSnap.id}${tagUrl}`});
        }
        // startAfter
        const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          prevNext.push({text: ctx.i18n.btn.next(),
            callback_data: `c/${currentCatalog.id}?s=${startAfterSnap.id}${tagUrl}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
      // get photo catalog
      if (currentCatalog.photoId) {
        publicImgUrl = `photos/o/${objectId}/c/${currentCatalog.id}/${currentCatalog.photoId}/2.jpg`;
      }
    } else {
      // back button
      // inlineKeyboardArray.push([{text: `⤴️ ../${object.name}`, callback_data: `objects/${objectId}`}]);
      // show catalog siblings, get catalogs snap index or siblings
      const catalogsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
          .collection("catalogs")
          .where("parentId", "==", null).orderBy("orderNumber").get();
      catalogsSnapshot.docs.forEach((doc) => {
        inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id}`}]);
      });
    }
    // cart buttons
    cartButtons[0].text = `🏪 ${object.name}`;
    inlineKeyboardArray.push(cartButtons);
    // render
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name} > Каталог${currentCatalog ? ` > ${currentCatalog.name}` : ""}</b>\n` +
        `${process.env.BOT_SITE}/o/${objectId}/c${catalogId ? "/" + catalogId : ""} ` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
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
    // enable edit mode
    const editOn = ctx.state.params.get("editOn");
    const editOff = ctx.state.params.get("editOff");
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
    const productId = ctx.state.param;
    const objectIdSession = ctx.state.sessionMsg.url.searchParams.get("objectId");
    const objectId = ctx.state.params.get("o") || objectIdSession;
    if (ctx.state.params.get("o")) {
      ctx.state.sessionMsg.url.searchParams.set("objectId", objectId);
    }
    const object = await store.findRecord(`objects/${objectId}`);
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    if (!product) {
      await ctx.answerCbQuery("Product not found");
      return;
    }
    ctx.state.sessionMsg.url.searchParams.set("productPriceChange", product.price);
    product.price = roundNumber(product.price * object.currencies[product.currency]);
    const cartButtons = await cart.cartButtons(objectId, ctx);
    let catalogUrl = `c/${product.catalogId}`;
    // const sessionPathCatalog = await store.findRecord(`users/${ctx.from.id}`, "session.pathCatalog");
    const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathCatalog");
    if (sessionPathCatalog) {
      catalogUrl = sessionPathCatalog;
    } else {
      ctx.state.sessionMsg.url.searchParams.set("pathCatalog", catalogUrl);
    }
    const inlineKeyboardArray = [];
    inlineKeyboardArray.push([{text: `⤴️ ${product.pathArray[product.pathArray.length - 1].name}`, callback_data: catalogUrl}]);
    // default add button
    const addButton = {text: ctx.i18n.btn.buy(), callback_data: `k/${product.id}`};
    // get cart products
    const cartProduct = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`,
        `products.${productId}`);
    ctx.state.sessionMsg.url.searchParams.delete("inCart");
    if (cartProduct) {
      addButton.text = `🛒 ${cartProduct.qty} ${cartProduct.unit} ` +
      ` ${roundNumber(cartProduct.qty * cartProduct.price)} ${process.env.BOT_CURRENCY}`;
      addButton.callback_data = `k/${product.id}?qty=${cartProduct.qty}`;
      ctx.state.sessionMsg.url.searchParams.set("inCart", true);
    }
    inlineKeyboardArray.push([addButton]);
    // add session vars
    ctx.state.sessionMsg.url.searchParams.set("productName", product.name);
    ctx.state.sessionMsg.url.searchParams.set("productPrice", product.price);
    ctx.state.sessionMsg.url.searchParams.set("productUnit", product.unit);
    // for edit
    ctx.state.sessionMsg.url.searchParams.set("sheetId", object.sheetId);
    ctx.state.sessionMsg.url.searchParams.set("productPurchasePrice", product.purchasePrice);
    ctx.state.sessionMsg.url.searchParams.set("productCurrency", product.currency);
    ctx.state.sessionMsg.url.searchParams.set("productRowNumber", product.rowNumber);
    // chck photos
    if (product.photos && product.photos.length) {
      inlineKeyboardArray.push([{text: `🖼 Фото (${product.photos.length})`,
        callback_data: `s/${product.id}`}]);
    }
    // Get main photo url.
    let publicImgUrl = null;
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    if (product.mainPhoto) {
      publicImgUrl = `photos/o/${objectId}/p/${product.id}/${product.mainPhoto}/2.jpg`;
    }
    // footer buttons
    cartButtons[0].text = `🏪 ${object.name}`;
    inlineKeyboardArray.push(cartButtons);
    const page = ctx.state.sessionMsg.url.searchParams.get("page");
    if (page) {
      inlineKeyboardArray.push([{text: ctx.i18n.btn.backToSearch(), callback_data: `search/${page}`}]);
    }
    const media = await photoCheckUrl(publicImgUrl);
    ctx.state.sessionMsg.url.searchParams.set("media", media);
    // admin btns
    if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
      inlineKeyboardArray.push([{text: "🔒 Отключить Режим редактирования",
        callback_data: `p/${product.id}?editOff=true`}]);
    } else {
      inlineKeyboardArray.push([{text: "📝 Включить Режим редактирования",
        callback_data: `p/${product.id}?editOn=true`}]);
    }
    if (ctx.state.isAdmin && ctx.state.sessionMsg.url.searchParams.get("editMode")) {
      inlineKeyboardArray.push([{text: "Изменить наименовение товара",
        callback_data: `b/${product.id}?todo=name&column=C`}]);
      inlineKeyboardArray.push([{text: `Изменить закупочную цену ${product.purchasePrice} ${product.currency}`,
        callback_data: `b/${product.id}?todo=purchasePrice&column=D`}]);
      inlineKeyboardArray.push([{text: "Изменить продажную цену товара",
        callback_data: `b/${product.id}?todo=price&column=E`}]);
      inlineKeyboardArray.push([{text: "Удалить товар",
        callback_data: `b/${product.id}?todo=del`}]);
      inlineKeyboardArray.push([{text: "📸 Загрузить фото",
        callback_data: `u/${product.id}?todo=prod`}]);
      inlineKeyboardArray.push([{text: "Загрузить в Merch",
        callback_data: `uploadMerch/${product.id}`}]);
    }
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name} \n${product.name} (${product.id})\n</b>` +
      `${ctx.i18n.product.price()}: ${product.price} ${process.env.BOT_CURRENCY}\n` +
      `${process.env.BOT_SITE}/o/${objectId}/p/${productId} ` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showProduct);

// add product to cart by keyboard
catalogsActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "a") {
    const objectId = ctx.state.sessionMsg.url.searchParams.get("objectId");
    const id = ctx.state.param;
    const name = ctx.state.sessionMsg.url.searchParams.get("productName");
    const price = + ctx.state.sessionMsg.url.searchParams.get("productPrice");
    const unit = ctx.state.sessionMsg.url.searchParams.get("productUnit");
    const inCart = ctx.state.sessionMsg.url.searchParams.get("inCart");
    const redirectToCart = ctx.state.sessionMsg.url.searchParams.get("cart");
    const page = ctx.state.sessionMsg.url.searchParams.get("page");
    const qty = + ctx.state.params.get("qty") || 0;
    ctx.state.sessionMsg.url.searchParams.set("productAddedQty", qty);
    ctx.state.sessionMsg.url.searchParams.set("productAddedId", id);
    ctx.state.sessionMsg.url.searchParams.set("productAddedObjectId", objectId);
    // if product exist
    if (inCart) {
      if (qty) {
        // await cart.add(objectId, ctx.from.id, inCart ? product.id : product, addValue);
        await cart.update({
          objectId,
          userId: ctx.from.id,
          product: {
            [id]: {
              qty,
            },
          },
        });
        await ctx.answerCbQuery(`${name} ${qty}${unit}, ${ctx.i18n.product.upd()}`);
      } else {
        await cart.delete({
          objectId,
          userId: ctx.from.id,
          id,
        });
        await ctx.answerCbQuery(`${name}, ${ctx.i18n.product.del()}`);
      }
    } else {
      // add new product
      if (qty) {
        await cart.add({
          objectId,
          userId: ctx.from.id,
          fromBot: true,
          product: {
            [id]: {
              name,
              price,
              unit,
              qty,
              createdAt: Math.floor(Date.now() / 1000),
            },
          },
        });
      }
      await ctx.answerCbQuery(`${name} ${qty}${unit}, ${ctx.i18n.product.add()}`);
    }
    //   ctx.state.routeName = "c";
    //   // eslint-disable-next-line no-useless-escape
    //   const regPath = catalogUrl.match(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&\/:~+]+)?/);
    //   ctx.state.param = regPath[2];
    //   const args = regPath[3];
    //   ctx.state.params.clear();
    //   if (args) {
    //     for (const paramsData of args.split("&")) {
    //       ctx.state.params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
    //     }
    //   }
    //   ctx.callbackQuery.data = catalogUrl;
    //   await showCatalog(ctx, next);
    // redirect
    if (page) {
      // ctx.state.routeName = "search";
      // ctx.state.param = page;
      // ctx.callbackQuery.data = ;
      parseUrl(ctx, `search/${page}`);
      await searchProductHandle(ctx);
      return;
    }
    if (redirectToCart) {
      parseUrl(ctx, "cart");
      await showCart(ctx);
    } else {
      // ctx.state.routeName = "p";
      // ctx.state.param = id;
      // await showProduct(ctx, next);
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathCatalog");
      parseUrl(ctx, sessionPathCatalog ? sessionPathCatalog : "c");
      await showCatalog(ctx);
    }
  } else {
    return next();
  }
});

catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "k") {
    let qty = ctx.state.params.get("qty") || 0;
    const number = ctx.state.params.get("n");
    const back = ctx.state.params.get("b");
    const objectId = ctx.state.sessionMsg.url.searchParams.get("objectId");
    const productId = ctx.state.param;
    const productName = ctx.state.sessionMsg.url.searchParams.get("productName");
    const productPrice = ctx.state.sessionMsg.url.searchParams.get("productPrice");
    const productUnit = ctx.state.sessionMsg.url.searchParams.get("productUnit");
    const media = ctx.state.sessionMsg.url.searchParams.get("media");
    const inCart = ctx.state.sessionMsg.url.searchParams.get("inCart");
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
    const paramsUrl = `qty=${qty}`;
    // check max qty
    if (qty > 20000) {
      await ctx.answerCbQuery("qty > 20000");
      return false;
    }
    // buttons
    const addButtonArray = [];
    if (inCart) {
      addButtonArray.push({text: ctx.i18n.btn.del(), callback_data: `a/${productId}`});
    }
    addButtonArray.push({text: ctx.i18n.btn.buy(), callback_data: `a/${productId}?${paramsUrl}`});
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${ctx.i18n.product.placeholderQty()}</b>\n${productName} (${productId})\n` +
      `${ctx.i18n.product.price()}: ${productPrice} ${process.env.BOT_CURRENCY}\n` +
      `<b>${ctx.i18n.product.qty()}: ${qty} ${productUnit}</b>\n` +
      `${ctx.i18n.product.sum()}: ${roundNumber(qty * productPrice)} ${process.env.BOT_CURRENCY}\n` +
      `${process.env.BOT_SITE}/o/${objectId}/p/${productId} ` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: [
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
        ],
        [
          {text: "0️", callback_data: `k/${productId}?n=0&${paramsUrl}`},
          {text: "🔙", callback_data: `k/${productId}?b=1&${paramsUrl}`},
          {text: "AC", callback_data: `k/${productId}`},
        ],
        addButtonArray,
        [
          {text: `⤴️ ${productName} (${productId})`, callback_data: `p/${productId}`},
        ],
      ],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// show cart
const showCart = async (ctx, next) => {
  if (ctx.state.routeName === "cart") {
    const clear = ctx.state.params.get("clear");
    const clearOrder = ctx.state.params.get("clearOrder");
    const objectIdSession = ctx.state.sessionMsg.url.searchParams.get("objectId");
    const objectId = ctx.state.params.get("o") || objectIdSession;
    ctx.state.sessionMsg.url.searchParams.delete("page");
    ctx.state.sessionMsg.url.searchParams.delete("productAddedQty");
    ctx.state.sessionMsg.url.searchParams.delete("productAddedId");
    ctx.state.sessionMsg.url.searchParams.delete("productAddedObjectId");
    ctx.state.sessionMsg.url.searchParams.delete("search_text");
    ctx.state.sessionMsg.url.searchParams.delete("pathCatalog");
    ctx.state.sessionMsg.url.searchParams.delete("productName");
    ctx.state.sessionMsg.url.searchParams.delete("productPrice");
    ctx.state.sessionMsg.url.searchParams.delete("productUnit");
    ctx.state.sessionMsg.url.searchParams.delete("media");
    ctx.state.sessionMsg.url.searchParams.delete("inCart");
    if (clearOrder) {
      // await store.createRecord(`users/${ctx.from.id}`, {"session": {
      //   "orderData": null,
      // }});
      ctx.state.sessionMsg.url.searchParams.delete("orderData_id");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_orderNumber");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_lastName");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_firstName");
    }
    // clear cart
    if (clear) {
      await cart.clear(objectId, ctx.from.id);
    }
    const inlineKeyboardArray = [];
    const object = await store.findRecord(`objects/${objectId}`);
    let msgTxt = `<b>${object.name} > ${ctx.i18n.btn.cart()}</b>\n`;
    let totalQty = 0;
    let totalSum = 0;
    // let itemShow = 0;
    const products = await cart.products(objectId, ctx.from.id);
    // redirect to cart param
    ctx.state.sessionMsg.url.searchParams.set("cart", true);
    for (const [index, cartProduct] of products.entries()) {
      // check cart products price exist...
      const product = await store.findRecord(`objects/${objectId}/products/${cartProduct.id}`);
      if (product) {
        product.price = roundNumber(product.price * object.currencies[product.currency]);
        // const productTxt = `${index + 1}) <b>${product.name}</b> (${product.id})` +
        // `=${product.price} ${process.env.BOT_CURRENCY}*${cartProduct.qty}${product.unit}` +
        // `=${roundNumber(product.price * cartProduct.qty)}${process.env.BOT_CURRENCY}`;
        // // truncate long string
        // if ((msgTxt + `${productTxt}\n`).length < 1000) {
        //   msgTxt += `${productTxt}\n`;
        //   itemShow++;
        //   // msgTxt = msgTxt.substring(0, 1024);
        // }
        inlineKeyboardArray.push([
          {text: `${index + 1}) ${cartProduct.qty}${product.unit}=` +
          // `${roundNumber(cartProduct.qty * product.price)} ${process.env.BOT_CURRENCY} ` +
          `${product.name} (${product.id})`,
          callback_data: `p/${product.id}`},
        ]);
        // update price in cart
        if (product.price !== cartProduct.price) {
          // products this is name field!!!
          const products = {
            [product.id]: {
              price: product.price,
            },
          };
          await store.createRecord(`objects/${objectId}/carts/${ctx.from.id}`, {products});
        }
        totalQty += cartProduct.qty;
        totalSum += cartProduct.qty * product.price;
      } else {
        // delete product
        await cart.delete({
          objectId,
          userId: ctx.from.id,
          id: cartProduct.id,
        });
      }
    }
    // if (itemShow !== inlineKeyboardArray.length) {
    //   msgTxt += ctx.i18n.txt.cartFuel() + "\n";
    // }
    if (totalQty) {
      msgTxt += `<b>${ctx.i18n.product.qty()}: ${totalQty}\n` +
      `${ctx.i18n.product.sum()}: ${roundNumber(totalSum)} ${process.env.BOT_CURRENCY}</b>\n` +
      `<a href="${process.env.BOT_SITE}/o/${objectId}/share-cart/${ctx.from.id}">${process.env.BOT_SITE}/o/${objectId}/share-cart/${ctx.from.id}</a>`;
    }

    if (inlineKeyboardArray.length < 1) {
      inlineKeyboardArray.push([
        {text: "📁 Каталог", callback_data: "c"},
      ]);
      msgTxt += ctx.i18n.txt.cartEmpty();
    } else {
      // const orderData = await store.findRecord(`users/${ctx.from.id}`, "session.orderData");
      const orderDataId = ctx.state.sessionMsg.url.searchParams.get("orderData_id");
      const orderDataOrderNumber = ctx.state.sessionMsg.url.searchParams.get("orderData_orderNumber");
      const orderDataLastName = ctx.state.sessionMsg.url.searchParams.get("orderData_lastName");
      const orderDataFirstNme = ctx.state.sessionMsg.url.searchParams.get("orderData_firstName");
      const pathOrderCurrent = ctx.state.sessionMsg.url.searchParams.get("pathOrderCurrent");
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
      // clear cart
      inlineKeyboardArray.push([{text: ctx.i18n.btn.clearCart(),
        callback_data: "cart?clear=1"}]);
      // share cart
      inlineKeyboardArray.push([
        {text: ctx.i18n.btn.linkCart(), url: `${process.env.BOT_SITE}/o/${objectId}/share-cart/${ctx.from.id}`},
      ]);
    }
    // Set Main menu
    inlineKeyboardArray.push([{text: `🏪 ${object.name}`,
      callback_data: `o/${objectId}`}]);
    // edit message
    let publicImgUrl = null;
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: msgTxt + ctx.state.sessionMsg.linkHTML(),
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
    let qty = ctx.state.params.get("qty") || 0;
    const number = ctx.state.params.get("n");
    const back = ctx.state.params.get("b");
    const orderId = ctx.state.params.get("oId");
    const carrierId = ctx.state.params.get("cId");
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
    // add rnd param to fast load
    // let rnd = "";
    // if (error || !Number(number)) {
    //   rnd = Math.random().toFixed(2).substring(2);
    // }
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
      {text: "0️", callback_data: `w/k?n=0&${paramsUrl}`},
      {text: "🔙", callback_data: `w/k?b=1&${paramsUrl}`},
      {text: "AC", callback_data: `w/k?${paramsUrl}`},
    ]);
    // edit order mode or purchase
    if (orderId) {
      inlineKeyboardArray.push([{text: "Ok", callback_data: `e/${orderId}?cN=${qty}&saveCarrier=${carrierId}`}]);
      inlineKeyboardArray.push([{text: "⬅️ Назад", callback_data: `r/${orderId}`}]);
    } else {
      inlineKeyboardArray.push([{text: "Ok", callback_data: `w/setCurrier?cN=${qty}&cId=${carrierId}`}]);
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
    ctx.state.sessionMsg.url.searchParams.set("scene", "wizardOrder");
    ctx.state.sessionMsg.url.searchParams.set("cursor", 3);
    await ctx.replyWithHTML(ctx.i18n.txt.address() + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: ctx.i18n.txt.address(),
      }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"scene": "wizardOrder", "cursor": 3}});
  },
  // 3
  async (ctx, address) => {
    // const address = ctx.message.text;
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {address}}});
    ctx.state.sessionMsg.url.searchParams.set("address", address);
    ctx.state.sessionMsg.url.searchParams.set("cursor", 4);
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.lastName()}</b>` + ctx.state.sessionMsg.linkHTML(),
        {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: ctx.i18n.txt.lastName(),
          },
        });
    // reply last name alert
    // const inlineKeyboard = [];
    // inlineKeyboard.push([{text: "Ввести другую фамилию.", callback_data: "w/setLastName"}]);
    // if (ctx.from.last_name) {
    //   inlineKeyboard.push([{text: `Выбрать свою фамилию ${ctx.from.last_name}`, callback_data: "w/setCurrentLastName"}]);
    // }
    // const lastName = ctx.from.last_name ? ctx.from.last_name : null;
    // const keyboard = lastName ? [[lastName], ["Отмена"]] : [["Отмена"]];
    // await ctx.replyWithHTML(`Введите фамилию получателя ${ctx.from.last_name ? "или выберите свою" : ""}` + ctx.state.sessionMsg.linkHTML(), {
    //   reply_markup: {
    //     // keyboard,
    //     // resize_keyboard: true,
    //     inline_keyboard: inlineKeyboard,
    //   }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 4}});
  },
  // 4
  async (ctx, lastName) => {
    ctx.state.sessionMsg.url.searchParams.set("lastName", lastName);
    // reply first name
    ctx.state.sessionMsg.url.searchParams.set("cursor", 5);
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.firstName()}</b>` + ctx.state.sessionMsg.linkHTML(),
        {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: ctx.i18n.txt.firstName(),
          },
        });
    // const firstName = ctx.from.first_name;
    // const inlineKeyboard = [];
    // inlineKeyboard.push([{text: "Ввести другое имя.", callback_data: "w/setFirstName"}]);
    // if (ctx.from.first_name) {
    //   inlineKeyboard.push([{text: `Выбрать свое имя ${ctx.from.first_name}`, callback_data: "w/setCurrentFirstName"}]);
    // }
    // // const keyboard = [[firstName], ["Отмена"]];
    // await ctx.replyWithHTML("Введите имя получателя или выберите свое" + ctx.state.sessionMsg.linkHTML(), {
    //   reply_markup: {
    //     // keyboard,
    //     // resize_keyboard: true,
    //     inline_keyboard: inlineKeyboard,
    //   }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 5}});
  },
  // 5
  async (ctx, firstName) => {
    // const firstName = ctx.message.text;
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {firstName}}});
    ctx.state.sessionMsg.url.searchParams.set("firstName", firstName);
    ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.phoneNumber()} ${process.env.BOT_PHONETEMPLATE}</b>` + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: process.env.BOT_PHONETEMPLATE,
      },
    });
    // const inlineKeyboard = [];
    // inlineKeyboard.push([{text: "Отправить свой номер", callback_data: "w/setCurrentPhoneNumber"}]);
    // inlineKeyboard.push([{text: "Ввести другой номер", callback_data: "w/setPhoneNumber"}]);
    // await ctx.replyWithHTML("Введите номер телефона" + ctx.state.sessionMsg.linkHTML(), {
    //   reply_markup: {
    //     // keyboard,
    //     // resize_keyboard: true,
    //     inline_keyboard: inlineKeyboard,
    //   }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 6}});
  },
  // 6
  async (ctx, phoneNumberText) => {
    // const phoneNumberText = (ctx.message.contact && ctx.message.contact.phone_number) || ctx.message.text;
    const regexpPhoneRu = new RegExp(process.env.BOT_PHONEREGEXP);
    const checkPhone = phoneNumberText.match(regexpPhoneRu);
    if (!checkPhone) {
      await ctx.replyWithHTML(`${ctx.i18n.txt.phoneNumber()} ${process.env.BOT_PHONETEMPLATE}` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: process.env.BOT_PHONETEMPLATE,
        },
      });
      return;
    }
    const phoneNumber = `${process.env.BOT_PHONECODE}${checkPhone[2]}`;
    ctx.state.sessionMsg.url.searchParams.set("phoneNumber", phoneNumber);
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {phoneNumber}}});
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: ctx.i18n.btn.proceed(), callback_data: "w/setNoComment"}]);
    inlineKeyboard.push([{text: ctx.i18n.btn.addComment(), callback_data: "w/setComment"}]);
    await ctx.replyWithHTML(ctx.i18n.txt.comment() + ctx.state.sessionMsg.linkHTML(),
        {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 7}});
  },
  // 7
  async (ctx, comment) => {
    // if (ctx.message.text && ctx.message.text !== "Без комментариев") {
    //   const comment = ctx.message.text;
    //   await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {comment}}});
    // }
    if (comment) {
      ctx.state.sessionMsg.url.searchParams.set("comment", comment);
    }
    // get preorder data
    // const preOrderData = await store.findRecord(`users/${ctx.from.id}`, "session.wizardData");
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: ctx.i18n.btn.purchaseConfirm(), callback_data: "w/createOrder"}]);
    // inlineKeyboard.push([{text: "Отмена", callback_data: "w/cancelOrder"}]);
    const preOrderData = ctx.state.sessionMsg.url.searchParams;
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.check()}:</b>\n` +
        `${preOrderData.get("lastName")} ${preOrderData.get("firstName")} ${preOrderData.get("phoneNumber")}\n` +
        `${preOrderData.get("address")}\n` +
        `Доставка: ${store.carriers().get(+ preOrderData.get("carrierId")).name} ` +
        `${preOrderData.get("carrierNumber") ? "#" + preOrderData.get("carrierNumber") : ""}\n` +
        `Оплата: ${store.payments().get(+ preOrderData.get("paymentId"))}\n` +
        `${preOrderData.get("comment") ? `${ctx.i18n.txt.comment()}: ${preOrderData.get("comment")}` : ""}` + ctx.state.sessionMsg.linkHTML(),
    {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 8}});
  },
];
// save order final
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "w") {
    const todo = ctx.state.param;
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
      const paymentId = + ctx.state.params.get("paymentId");
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
    // open keyboard
    // if (todo === "o") {
    //   const carrierId = + ctx.state.params.get("cId");
    //   ctx.state.sessionMsg.url.searchParams.set("carrierId", carrierId);
    //   await cartWizard[1](ctx);
    // }
    // set carrier number by virt keyboard
    if (todo === "k") {
      await cartWizard[1](ctx);
    }
    if (todo === "setCurrier") {
      const carrierId = + ctx.state.params.get("cId");
      const carrierNumber = + ctx.state.params.get("cN");
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
      const carrierId = + ctx.state.params.get("cId");
      // await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {carrierId}}});
      // test save msg session
      ctx.state.sessionMsg.url.searchParams.set("carrierId", carrierId);
      await ctx.deleteMessage();
      await cartWizard[2](ctx);
    }
    // save last name user
    if (todo === "setCurrentLastName") {
      await ctx.deleteMessage();
      await cartWizard[4](ctx, ctx.from.last_name);
    }
    // save custom last name
    if (todo === "setLastName") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 4);
      await ctx.replyWithHTML("<b>Введите фамилию получателя</b>" + ctx.state.sessionMsg.linkHTML(),
          {
            reply_markup: {
              force_reply: true,
            },
          });
    }
    // save last name user
    if (todo === "setCurrentFirstName") {
      await ctx.deleteMessage();
      await cartWizard[5](ctx, ctx.from.first_name);
    }
    // save custom last name
    if (todo === "setFirstName") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 5);
      await ctx.replyWithHTML("<b>Введите имя получателя</b>" + ctx.state.sessionMsg.linkHTML(),
          {
            reply_markup: {
              force_reply: true,
            },
          });
    }
    // save phone number
    if (todo === "setCurrentPhoneNumber") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
      await ctx.replyWithHTML("Нажмите кнопку Отправить свой номер" + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          keyboard: [
            [{
              text: "Отправить свой номер",
              request_contact: true,
            }],
            [{text: "Отмена"}],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }
    if (todo === "setPhoneNumber") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
      await ctx.replyWithHTML("Введите номер телефона" + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        },
      });
    }
    // set comment
    if (todo === "setComment") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 7);
      await ctx.replyWithHTML(ctx.i18n.txt.comment() + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: ctx.i18n.txt.comment(),
        },
      });
    }
    if (todo === "setNoComment") {
      await ctx.deleteMessage();
      await cartWizard[7](ctx);
    }
    // create order
    if (todo === "createOrder") {
      const preOrderData = ctx.state.sessionMsg.url.searchParams;
      const wizardData = {
        "objectId": preOrderData.get("objectId"),
        "lastName": preOrderData.get("lastName"),
        "firstName": preOrderData.get("firstName"),
        "phoneNumber": preOrderData.get("phoneNumber"),
        "address": preOrderData.get("address"),
        "carrierId": + preOrderData.get("carrierId"),
        "paymentId": + preOrderData.get("paymentId"),
      };
      if (preOrderData.get("carrierNumber")) {
        wizardData["carrierNumber"] = + preOrderData.get("carrierNumber");
      }
      if (preOrderData.get("comment")) {
        wizardData["comment"] = preOrderData.get("comment");
      }
      try {
        await cart.createOrder(ctx, wizardData);
        await ctx.deleteMessage();
        await ctx.reply(`${ctx.i18n.txt.confirm()} /objects`, {
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
      await ctx.reply("Commands /objects /search", {
        reply_markup: {
          remove_keyboard: true,
        }});
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
    // const objectId = ctx.state.params.get("o");
    const objectId = ctx.state.sessionMsg.url.searchParams.get("objectId");
    const object = await store.findRecord(`objects/${objectId}`);
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    let catalogUrl = `c/${catalog.id}`;
    // if (ctx.session.pathCatalog) {
    //   catalogUrl = ctx.session.pathCatalog;
    // }
    // const sessionPathCatalog = await store.findRecord(`users/${ctx.from.id}`, "session.pathCatalog");
    const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathCatalog");
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
      facetFilters: [[`seller:${object.name}`], [`categories.lvl${pathNames.length - 1}:${pathNames.join(" > ")}`]],
    });
    // console.log(`categories.lvl${pathNames.length - 1}:${pathNames.join(" > ")}`);
    for (const [tagName, tagCount] of Object.entries(tags.facets.subCategory || {})) {
      const transTagName = cyrillicToTranslitUk.transform(cyrillicToTranslit.transform(tagName, "-")).toLowerCase();
      if (transTagName === ctx.state.params.get("tS")) {
        inlineKeyboardArray.push([{text: `✅ ${tagName} (${tagCount})`, callback_data: `c/${catalog.id}?t=${transTagName}`}]);
      } else {
        inlineKeyboardArray.push([{text: `🎚 ${tagName} (${tagCount})`, callback_data: `c/${catalog.id}?t=${transTagName}`}]);
      }
    }
    let publicImgUrl = null;
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name} > ${ctx.i18n.btn.filter()}</b>` + ctx.state.sessionMsg.linkHTML(),
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
  if (ctx.state.routeName === "s") {
    const productId = ctx.state.param;
    const photoId = ctx.state.params.get("pId");
    const todo = ctx.state.params.get("todo");
    const objectId = ctx.state.sessionMsg.url.searchParams.get("objectId");
    // set main photo
    if (todo === "main") {
      await store.updateRecord(`objects/${objectId}/products/${productId}`, {
        mainPhoto: photoId,
      });
      await ctx.editMessageCaption(`Main photo updated ${productId}`+ ctx.state.sessionMsg.linkHTML(),
          {
            reply_markup: {
              inline_keyboard: [
                [{text: "🗑 Delete", callback_data: `s/${productId}?pId=${photoId}&todo=delete`}],
                [{text: "❎ Закрыть", callback_data: `s/${productId}?pId=${photoId}&todo=close`}],
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
    const productRef = firebase.firestore().collection("objects").doc(objectId)
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
                photos: firestore.FieldValue.arrayRemove(photoId),
              });
              break;
            }
          }
        } else {
          await productRef.update({
            mainPhoto: firestore.FieldValue.delete(),
            photos: firestore.FieldValue.arrayRemove(photoId),
          });
        }
      } else {
        await productRef.update({
          photos: firestore.FieldValue.arrayRemove(photoId),
        });
      }
      // delete photos from bucket
      // await bucket.deleteFiles({
      //   prefix: `photos/o/${objectId}/p/${productId}/${deleteFileId}`,
      // });
      await deletePhotoStorage(`photos/o/${objectId}/p/${productId}/${photoId}`);
      await ctx.deleteMessage();
      return;
    }
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    for (const [index, photoId] of product.photos.entries()) {
      const inlineKeyboardArray = [];
      // if admin
      if (ctx.state.isAdmin) {
        if (product.mainPhoto !== photoId) {
          inlineKeyboardArray.push([{text: "🏷 Set main",
            callback_data: `s/${product.id}?pId=${photoId}&todo=main`}]);
        }
        inlineKeyboardArray.push([{text: "🗑 Delete",
          callback_data: `s/${product.id}?pId=${photoId}&todo=delete`}]);
      }
      inlineKeyboardArray.push([{text: "❎ Закрыть", callback_data: `s/${product.id}?todo=close`}]);
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
  if (ctx.state.routeName === "u") {
    const objectId = ctx.state.sessionMsg.url.searchParams.get("objectId");
    const todo = ctx.state.params.get("todo");
    ctx.state.sessionMsg.url.searchParams.set("scene", `upload-${todo}`);
    const paramId = ctx.state.param;
    let caption;
    if (todo === "prod") {
      ctx.state.sessionMsg.url.searchParams.set("upload-productId", paramId);
      const productName = ctx.state.sessionMsg.url.searchParams.get("productName");
      // const product = await store.findRecord(`objects/${objectId}/products/${paramId}`);
      caption = `Добавьте фото <b>${productName} (${paramId})</b>`;
    }
    if (todo === "cat") {
      ctx.state.sessionMsg.url.searchParams.set("upload-catalogId", paramId);
      const catalog = await store.findRecord(`objects/${objectId}/catalogs/${paramId}`);
      caption = `Добавьте фото <b>${catalog.name} (${catalog.id})</b>`;
    }
    if (todo === "obj") {
      const object = await store.findRecord(`objects/${paramId}`);
      caption = `Добавьте фото <b>${object.name} (${object.id})</b>`;
    }
    await ctx.replyWithHTML(caption + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        force_reply: true,
      }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// change product data
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "b") {
    const objectId = ctx.state.sessionMsg.url.searchParams.get("objectId");
    const name = ctx.state.sessionMsg.url.searchParams.get("productName");
    const price = ctx.state.sessionMsg.url.searchParams.get("productPriceChange");
    const purchasePrice = ctx.state.sessionMsg.url.searchParams.get("productPurchasePrice");
    const productCurrency = ctx.state.sessionMsg.url.searchParams.get("productCurrency");
    const todo = ctx.state.params.get("todo");
    const column = ctx.state.params.get("column");
    ctx.state.sessionMsg.url.searchParams.set("scene", "changeProduct");
    ctx.state.sessionMsg.url.searchParams.set("change-todo", todo);
    ctx.state.sessionMsg.url.searchParams.set("change-column", column);
    const paramId = ctx.state.param;
    ctx.state.sessionMsg.url.searchParams.set("change-productId", paramId);
    if (todo === "del") {
      // first exit from product
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathCatalog");
      parseUrl(ctx, sessionPathCatalog ? sessionPathCatalog : "c");
      await showCatalog(ctx);
      await ctx.replyWithHTML(`<b>${name} (${paramId})</b>\n` +
      `Введите <b>${todo}</b> для подтверждения удаления` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        }});
    } else {
      await ctx.replyWithHTML(`Изменить поле <b>${todo}</b>\n` +
      `<b>ObjectId: ${objectId}, ${name} (${paramId})</b>\n` +
      `Закупочная цена (purchasePrice) <b>${purchasePrice} ${productCurrency}</b>\n` +
      `Продажная цена (price) <b>${price} ${productCurrency}</b>` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: todo,
        }});
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.catalogsActions = catalogsActions;
exports.cartWizard = cartWizard;
exports.showCart = showCart;
