const firebase = require("firebase-admin");
const bucket = firebase.storage().bucket();
const {cart, store, roundNumber, photoCheckUrl, savePhotoTelegram} = require("./bot_store_cart");
const {searchHandle} = require("./bot_search");
// catalogs actions array
const catalogsActions = [];
// show catalogs and goods
const showCatalog = async (ctx, next) => {
  if (ctx.state.routeName === "c") {
    const objectId = ctx.state.params.get("o");
    const cartButtons = await cart.cartButtons(objectId, ctx.from.id);
    const catalogId = ctx.state.param;
    const tag = ctx.state.params.get("t");
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const uploadPhotoCat = ctx.state.params.get("u");
    let publicImgUrl = null;
    const object = await store.findRecord(`objects/${objectId}`);
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    // and show upload catalog photo
    let uUrl = "";
    if (uploadPhotoCat) {
      uUrl += "&u=1";
    }
    const inlineKeyboardArray =[];
    // ctx.session.pathCatalog = ctx.callbackQuery.data;
    // save to fire session
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"pathCatalog": ctx.callbackQuery.data}});
    ctx.state.sessionMsg.url.searchParams.set("pathCatalog", ctx.callbackQuery.data);
    ctx.state.sessionMsg.url.searchParams.delete("cart");
    if (catalogId) {
      const currentCatalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
      // back button
      inlineKeyboardArray.push([{text: `⤴️ ../${currentCatalog.name}`,
        callback_data: currentCatalog.parentId ? `c/${currentCatalog.parentId}?o=${objectId}${uUrl}` :
        `c?o=${objectId}${uUrl}`}]);
      if (ctx.state.isAdmin && uploadPhotoCat) {
        inlineKeyboardArray.push([{text: `📸 Загрузить фото каталога ${currentCatalog.name}`,
          callback_data: `uploadPhotoCat/${currentCatalog.id}?o=${objectId}`}]);
      }
      // products query
      let mainQuery = firebase.firestore().collection("objects").doc(objectId)
          .collection("products").where("catalog.id", "==", currentCatalog.id)
          .orderBy("orderNumber");
      // Filter by tag
      let tagUrl = "";
      if (tag) {
        mainQuery = mainQuery.where("tags", "array-contains", tag);
        tagUrl = `&t=${tag}`;
      }
      // add tags button
      if (currentCatalog.tags) {
        const tagsArray = [];
        tagsArray.push({text: "📌 Фильтр",
          callback_data: `t/${currentCatalog.id}?o=${objectId}`});
        // Delete or close selected tag
        if (tag) {
          tagsArray[0].callback_data = `t/${currentCatalog.id}?tagSelected=${tag}&o=${objectId}`;
          tagsArray.push({text: `❎ ${tag}`, callback_data: `c/${currentCatalog.id}?o=${objectId}`});
        }
        inlineKeyboardArray.push(tagsArray);
      }
      // show catalog siblings, get catalogs snap index or siblings
      const catalogsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
          .collection("catalogs")
          .where("parentId", "==", catalogId).orderBy("orderNumber").get();
      catalogsSnapshot.docs.forEach((doc) => {
        inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id}?o=${objectId}${uUrl}`}]);
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
      // get cart product
      const cartProductsArray = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products");
      // generate products array
      for (const product of productsSnapshot.docs) {
        const addButton = {text: `📦 ${roundNumber(product.data().price * object.currencies[product.data().currency])}` +
        `${process.env.BOT_CURRENCY} ${product.data().name} (${product.id})`,
        callback_data: `aC/${product.id}?o=${objectId}`};
        // get cart products
        const cartProduct = cartProductsArray && cartProductsArray[product.id];
        if (cartProduct) {
          addButton.text = `🛒${cartProduct.qty}${cartProduct.unit} ` +
          `${roundNumber(cartProduct.price * cartProduct.qty)} ` +
          `${process.env.BOT_CURRENCY} ${product.data().name} (${product.id})`;
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
          prevNext.push({text: "⬅️ Назад",
            callback_data: `c/${currentCatalog.id}?e=${endBeforeSnap.id}${tagUrl}&o=${objectId}`});
        }
        // startAfter
        const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          prevNext.push({text: "➡️ Вперед",
            callback_data: `c/${currentCatalog.id}?s=${startAfterSnap.id}${tagUrl}&o=${objectId}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
      // get photo catalog
      if (currentCatalog.photoId) {
        publicImgUrl = `photos/o/${objectId}/c/${currentCatalog.id}/${currentCatalog.photoId}/2.jpg`;
      }
    } else {
      // back button
      inlineKeyboardArray.push([{text: "⤴️ ../Главная", callback_data: `objects/${objectId}`}]);
      // show catalog siblings, get catalogs snap index or siblings
      const catalogsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
          .collection("catalogs")
          .where("parentId", "==", null).orderBy("orderNumber").get();
      catalogsSnapshot.docs.forEach((doc) => {
        inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id}?o=${objectId}${uUrl}`}]);
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
      caption: `<b>${object.name} > Каталог</b>\n` +
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
    // get product data
    const productId = ctx.state.param;
    const objectId = ctx.state.params.get("o");
    const object = await store.findRecord(`objects/${objectId}`);
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    product.price = roundNumber(product.price * object.currencies[product.currency]);
    const cartButtons = await cart.cartButtons(objectId, ctx.from.id);
    let catalogUrl = `c/${product.catalog.id}?o=${objectId}`;
    // const sessionPathCatalog = await store.findRecord(`users/${ctx.from.id}`, "session.pathCatalog");
    const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathCatalog");
    if (sessionPathCatalog) {
      catalogUrl = sessionPathCatalog;
    }
    const inlineKeyboardArray = [];
    inlineKeyboardArray.push([{text: `⤴️ ../${product.catalog.name}`, callback_data: catalogUrl}]);
    // default add button
    const addButton = {text: "🛒 Добавить в корзину", callback_data: `aC/${product.id}?o=${objectId}`};
    // get cart products
    const cartProduct = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`,
        `products.${productId}`);
    if (cartProduct) {
      addButton.text = `🛒 ${cartProduct.qty} ${cartProduct.unit} ` +
      ` ${roundNumber(cartProduct.qty * cartProduct.price)} ${process.env.BOT_CURRENCY}`;
      addButton.callback_data = `aC/${product.id}?qty=${cartProduct.qty}&a=1&o=${objectId}`;
    }
    inlineKeyboardArray.push([addButton]);
    if (ctx.state.isAdmin) {
      inlineKeyboardArray.push([{text: "📸 Загрузить фото",
        callback_data: `uploadPhotoProduct/${product.id}?o=${objectId}`}]);
    }
    // chck photos
    if (product.photos && product.photos.length) {
      inlineKeyboardArray.push([{text: `🖼 Показать фото (${product.photos.length})`,
        callback_data: `showPhotos/${product.id}?o=${objectId}`}]);
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
      inlineKeyboardArray.push([{text: "🔍 Ввернуться в поиск", callback_data: `search/${page}`}]);
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name}\n` +
      `${product.name} (${product.id})\n` +
      `Цена ${product.price} ${process.env.BOT_CURRENCY}</b>\n` +
      `${process.env.BOT_SITE}/o/${objectId}/p/${productId}` + ctx.state.sessionMsg.linkHTML(),
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
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "aC") {
    let qty = ctx.state.params.get("qty");
    const number = ctx.state.params.get("number");
    const back = ctx.state.params.get("back");
    // const redirectToCart = ctx.state.params.get("r");
    const redirectToCart = ctx.state.sessionMsg.url.searchParams.get("cart");
    const added = ctx.state.params.get("a");
    const productId = ctx.state.param;
    const addValue = ctx.state.params.get("addVal");
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
    // if (redirectToCart) {
    // paramsUrl += "&r=1";
    // ctx.session.pathCatalog = null;
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"pathCatalog": null}});
    // ctx.state.sessionMsg.url.searchParams.delete("pathCatalog");
    // }
    if (added) {
      paramsUrl += "&a=1";
    }
    const object = await store.findRecord(`objects/${objectId}`);
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    product.price = roundNumber(product.price * object.currencies[product.currency]);
    if (product) {
      let catalogUrl = `c/${product.catalog.id}?o=${objectId}`;
      // if (ctx.session.pathCatalog) {
      //   catalogUrl = ctx.session.pathCatalog;
      // }
      // const sessionPathCatalog = await store.findRecord(`users/${ctx.from.id}`, "session.pathCatalog");
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathCatalog");
      if (sessionPathCatalog) {
        catalogUrl = sessionPathCatalog;
      }
      const page = ctx.state.sessionMsg.url.searchParams.get("page");
      const searchText = ctx.state.sessionMsg.url.searchParams.get("search_text");
      // add product to cart
      if (addValue) {
        await cart.add(objectId, ctx.from.id, added ? product.id : product, addValue);
        if (page) {
          await searchHandle(ctx, searchText, + page);
          return;
        }
        if (redirectToCart) {
          ctx.state.routeName = "cart";
          await showCart(ctx, next);
        } else {
          ctx.state.routeName = "c";
          // eslint-disable-next-line no-useless-escape
          const regPath = catalogUrl.match(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&\/:~+]+)?/);
          ctx.state.param = regPath[2];
          const args = regPath[3];
          ctx.state.params.clear();
          if (args) {
            for (const paramsData of args.split("&")) {
              ctx.state.params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
            }
          }
          ctx.callbackQuery.data = catalogUrl;
          await showCatalog(ctx, next);
        }
        return;
      }
      const addButtonArray = [];
      const addButton = {text: "🛒 Добавить",
        callback_data: `aC/${product.id}?addVal=${qty}${paramsUrl}&o=${objectId}`};
      const delButton = {text: "❎ Удалить",
        callback_data: `aC/${product.id}?addVal=0${paramsUrl}&o=${objectId}`};
      if (added) {
        addButtonArray.push(delButton);
      }
      addButtonArray.push(addButton);
      // get main photo url.
      let publicImgUrl = null;
      if (object.photoId) {
        publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
      }
      if (product.mainPhoto) {
        publicImgUrl = `photos/o/${objectId}/p/${product.id}/${product.mainPhoto}/2.jpg`;
      }
      const uploadPhotoButton =[];
      if (ctx.state.isAdmin) {
        uploadPhotoButton.push({text: "📸 Загрузить фото",
          callback_data: `uploadPhotoProduct/${product.id}?o=${objectId}`});
        uploadPhotoButton.push({text: "Загрузить в Merch",
          callback_data: `uploadMerch/${product.id}?o=${objectId}`});
      }
      const searchButton = [];
      if (page) {
        searchButton.push({text: "🔍 Ввернуться в поиск", callback_data: `search/${page}`});
      }
      const media = await photoCheckUrl(publicImgUrl);
      await ctx.editMessageMedia({
        type: "photo",
        media,
        caption: `${product.name} (${product.id})` +
        `\nЦена ${product.price} ${process.env.BOT_CURRENCY}` +
        `\nСумма ${roundNumber(qty * product.price)} ${process.env.BOT_CURRENCY}` +
        `\n<b>Количетво: ${qty} ${product.unit}</b>` +
        `\n${process.env.BOT_SITE}/o/${objectId}/p/${productId}` + ctx.state.sessionMsg.linkHTML(),
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
            {text: "🔙", callback_data: `aC/${product.id}?back=1${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "AC", callback_data: `aC/${product.id}?clear=1${paramsUrl}&o=${objectId}`},
          ],
          addButtonArray,
          uploadPhotoButton,
          searchButton,
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
    const clear = ctx.state.params.get("clear");
    const deleteOrderId = ctx.state.params.get("deleteOrderId");
    const objectId = ctx.state.params.get("o");
    ctx.state.sessionMsg.url.searchParams.delete("page");
    ctx.state.sessionMsg.url.searchParams.delete("search_text");
    ctx.state.sessionMsg.url.searchParams.delete("pathCatalog");
    if (deleteOrderId) {
      await store.createRecord(`users/${ctx.from.id}`, {"session": {
        "orderData": null,
      }});
    }
    // clear cart
    if (clear) {
      await cart.clear(objectId, ctx.from.id);
    }
    const inlineKeyboardArray = [];
    const object = await store.findRecord(`objects/${objectId}`);
    let msgTxt = `<b>${object.name} > Корзина</b>\n`;
    let totalQty = 0;
    let totalSum = 0;
    let itemShow = 0;
    const products = await cart.products(objectId, ctx.from.id);
    // redirect to cart param
    ctx.state.sessionMsg.url.searchParams.set("cart", true);
    for (const [index, cartProduct] of products.entries()) {
      // check cart products price exist...
      const product = await store.findRecord(`objects/${objectId}/products/${cartProduct.id}`);
      product.price = roundNumber(product.price * object.currencies[product.currency]);
      if (product) {
        const productTxt = `${index + 1}) <b>${product.name}</b> (${product.id})` +
        `=${product.price} ${process.env.BOT_CURRENCY}*${cartProduct.qty}${product.unit}` +
        `=${roundNumber(product.price * cartProduct.qty)}${process.env.BOT_CURRENCY}`;
        // truncate long string
        if ((msgTxt + `${productTxt}\n`).length < 1000) {
          msgTxt += `${productTxt}\n`;
          itemShow++;
          // msgTxt = msgTxt.substring(0, 1024);
        }
        inlineKeyboardArray.push([
          {text: `${index + 1}) ${cartProduct.qty}${product.unit}=` +
          `${roundNumber(cartProduct.qty * product.price)} ${process.env.BOT_CURRENCY} ` +
          `${product.name} (${product.id})`,
          callback_data: `aC/${product.id}?qty=${cartProduct.qty}&a=1&o=${objectId}`},
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
      }
    }
    if (itemShow !== inlineKeyboardArray.length) {
      msgTxt += "⬇️Весь список нажмите на ссылку корзины⬇️\n";
    }
    if (totalQty) {
      msgTxt += `<b>Количество товара: ${totalQty}\n` +
      `Сумма: ${roundNumber(totalSum)} ${process.env.BOT_CURRENCY}</b>`;
    }

    if (inlineKeyboardArray.length < 1) {
      inlineKeyboardArray.push([
        {text: "📁 Каталог", callback_data: `c?o=${objectId}`},
      ]);
      msgTxt += "Корзина пуста";
    } else {
      const orderData = await store.findRecord(`users/${ctx.from.id}`, "session.orderData");
      if (orderData) {
        const orderId = orderData.orderNumber;
        inlineKeyboardArray.push([{text: `✅ Сохранить Заказ #${orderId} от ${orderData.lastName} ` +
        `${orderData.firstName}`, callback_data: `eO/${orderData.id}?sP=1&o=${objectId}`}]);
        // delete order from cart
        inlineKeyboardArray.push([{text: `❎ Убрать Заказ #${orderId} от ${orderData.lastName} ` +
        `${orderData.firstName}`, callback_data: `cart?deleteOrderId=${orderData.id}&o=${objectId}`}]);
      }
      // create order
      inlineKeyboardArray.push([{text: "✅ Оформить заказ",
        callback_data: `cO/payment?o=${objectId}`}]);
      // clear cart
      inlineKeyboardArray.push([{text: "🗑 Очистить корзину",
        callback_data: `cart?clear=1&o=${objectId}`}]);
      // share cart
      inlineKeyboardArray.push([
        {text: "Ссылка на корзину", url: `${process.env.BOT_SITE}/o/${objectId}/share-cart/${ctx.from.id}`},
      ]);
    }
    // Set Main menu
    inlineKeyboardArray.push([{text: `🏪 ${object.name}`,
      callback_data: `objects/${objectId}`}]);
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
    let qty = ctx.state.params.get("q");
    const number = ctx.state.params.get("n");
    const back = ctx.state.params.get("b");
    const carrierId = ctx.state.params.get("cId");
    const orderId = ctx.state.params.get("oId");
    const objectId = ctx.state.params.get("o");
    let qtyUrl = "";
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
      }
    }
    if (qty) {
      qtyUrl = `&q=${qty}`;
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
      paramsUrl = `&oId=${orderId}&o=${objectId}`;
    }
    // add rnd param to fast load
    let rnd = "";
    if (error || !Number(number)) {
      rnd = Math.random().toFixed(2).substring(2);
    }
    inlineKeyboardArray.push([
      {text: "7", callback_data: `cO/cN?n=7${qtyUrl}${paramsUrl}`},
      {text: "8", callback_data: `cO/cN?n=8${qtyUrl}${paramsUrl}`},
      {text: "9", callback_data: `cO/cN?n=9${qtyUrl}${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "4", callback_data: `cO/cN?n=4${qtyUrl}${paramsUrl}`},
      {text: "5", callback_data: `cO/cN?n=5${qtyUrl}${paramsUrl}`},
      {text: "6", callback_data: `cO/cN?n=6${qtyUrl}${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "1", callback_data: `cO/cN?n=1${qtyUrl}${paramsUrl}`},
      {text: "2", callback_data: `cO/cN?n=2${qtyUrl}${paramsUrl}`},
      {text: "3", callback_data: `cO/cN?n=3${qtyUrl}${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "0️", callback_data: `cO/cN?n=0${qtyUrl}${paramsUrl}`},
      {text: "🔙", callback_data: `cO/cN?b=1${qtyUrl}${paramsUrl}`},
      {text: "AC", callback_data: `cO/cN?cId=${carrierId}${paramsUrl}`},
    ]);
    // if order change callback
    if (orderId) {
      inlineKeyboardArray.push([{text: "Выбрать отделение", callback_data: `eO/${orderId}?` +
      `sCid=${carrierId}&n=${qty}&o=${objectId}&${rnd}`}]);
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `orders/${orderId}?o=${objectId}`}]);
    } else {
      inlineKeyboardArray.push([{text: "Выбрать отделение", callback_data: `cO/wizard?cN=${qty}` +
      `&cId=${carrierId}&${rnd}`}]);
      // get msg session
      const objectId = ctx.state.sessionMsg.url.searchParams.get("objectId");
      inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: `cart?o=${objectId}`}]);
    }
    await ctx.editMessageCaption(`Введите номер отделения:\n<b>${qty}</b>` +
      `\n${error ? "Ошибка: введите номер отделения" : ""}` + ctx.state.sessionMsg.linkHTML(),
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
    await ctx.replyWithHTML("Укажите адрес доставки (город)" + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        // keyboard: [["Отмена"]],
        // resize_keyboard: true,
        force_reply: true,
        input_field_placeholder: "Kyiv",
      }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"scene": "wizardOrder", "cursor": 3}});
  },
  // 3
  async (ctx, address) => {
    // const address = ctx.message.text;
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {address}}});
    ctx.state.sessionMsg.url.searchParams.set("address", address);
    // reply last name alert
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: "Ввести другую фамилию.", callback_data: "cO/setLastName"}]);
    if (ctx.from.last_name) {
      inlineKeyboard.push([{text: `Выбрать свою фамилию ${ctx.from.last_name}`, callback_data: "cO/setCurrentLastName"}]);
    }
    // const lastName = ctx.from.last_name ? ctx.from.last_name : null;
    // const keyboard = lastName ? [[lastName], ["Отмена"]] : [["Отмена"]];
    await ctx.replyWithHTML(`Введите фамилию получателя ${ctx.from.last_name ? "или выберите свою" : ""}` + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        // keyboard,
        // resize_keyboard: true,
        inline_keyboard: inlineKeyboard,
      }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 4}});
  },
  // 4
  async (ctx, lastName) => {
    ctx.state.sessionMsg.url.searchParams.set("lastName", lastName);
    // reply first name
    // const firstName = ctx.from.first_name;
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: "Ввести другое имя.", callback_data: "cO/setFirstName"}]);
    if (ctx.from.first_name) {
      inlineKeyboard.push([{text: `Выбрать свое имя ${ctx.from.first_name}`, callback_data: "cO/setCurrentFirstName"}]);
    }
    // const keyboard = [[firstName], ["Отмена"]];
    await ctx.replyWithHTML("Введите имя получателя или выберите свое" + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        // keyboard,
        // resize_keyboard: true,
        inline_keyboard: inlineKeyboard,
      }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 5}});
  },
  // 5
  async (ctx, firstName) => {
    // const firstName = ctx.message.text;
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {firstName}}});
    ctx.state.sessionMsg.url.searchParams.set("firstName", firstName);
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: "Отправить свой номер", callback_data: "cO/setCurrentPhoneNumber"}]);
    inlineKeyboard.push([{text: "Ввести другой номер", callback_data: "cO/setPhoneNumber"}]);
    await ctx.replyWithHTML("Введите номер телефона" + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        // keyboard,
        // resize_keyboard: true,
        inline_keyboard: inlineKeyboard,
      }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 6}});
  },
  // 6
  async (ctx, phoneNumberText) => {
    // const phoneNumberText = (ctx.message.contact && ctx.message.contact.phone_number) || ctx.message.text;
    const regexpPhoneRu = new RegExp(process.env.BOT_PHONEREGEXP);
    const checkPhone = phoneNumberText.match(regexpPhoneRu);
    if (!checkPhone) {
      await ctx.replyWithHTML(`Введите номер телефона в формате ${process.env.BOT_PHONETEMPLATE}` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        },
      });
      return;
    }
    const phoneNumber = `${process.env.BOT_PHONECODE}${checkPhone[2]}`;
    ctx.state.sessionMsg.url.searchParams.set("phoneNumber", phoneNumber);
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {phoneNumber}}});
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: "Без комментариев", callback_data: "cO/setNoComment"}]);
    inlineKeyboard.push([{text: "Добавить комментарий", callback_data: "cO/setComment"}]);
    await ctx.replyWithHTML("Комментарий к заказу:" + ctx.state.sessionMsg.linkHTML(),
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
    inlineKeyboard.push([{text: "Оформить заказ", callback_data: "cO/createOrder"}]);
    inlineKeyboard.push([{text: "Отмена", callback_data: "cO/cancelOrder"}]);
    const preOrderData = ctx.state.sessionMsg.url.searchParams;
    await ctx.replyWithHTML("<b>Проверьте даные получателя:\n" +
        `${preOrderData.get("lastName")} ${preOrderData.get("firstName")} ${preOrderData.get("phoneNumber")}\n` +
        `Адрес доставки: ${preOrderData.get("address")}, ` +
        `${store.carriers().get(+ preOrderData.get("carrierId")).name} ` +
        `${preOrderData.get("carrierNumber") ? "#" + preOrderData.get("carrierNumber") : ""}\n` +
        `Оплата: ${store.payments().get(+ preOrderData.get("paymentId"))}\n` +
        `${preOrderData.get("comment") ? "Комментарий: " + preOrderData.get("comment") : ""}</b>` + ctx.state.sessionMsg.linkHTML(),
    {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 8}});
  },
];
// save order final
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "cO") {
    const todo = ctx.state.param;
    // order payment method
    if (todo === "payment") {
      const objectId = ctx.state.params.get("o");
      ctx.state.sessionMsg.url.searchParams.set("objectId", objectId);
      // await store.createRecord(`users/${ctx.from.id}`, {session: {objectId}});
      // show paymets service
      const inlineKeyboardArray = [];
      store.payments().forEach((value, key) => {
        inlineKeyboardArray.push([{text: value, callback_data: `cO/carrier?payment_id=${key}&o=${objectId}`}]);
      });
      inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: `cart?o=${objectId}`}]);
      await cartWizard[0](ctx, "Способ оплаты", inlineKeyboardArray);
    }
    // set carrier
    if (todo === "carrier") {
      // save payment and clear old data use updateRecord
      const paymentId = + ctx.state.params.get("payment_id");
      const objectId = ctx.state.params.get("o");
      ctx.state.sessionMsg.url.searchParams.set("objectId", objectId);
      // clear and set data use update
      // await store.updateRecord(`users/${ctx.from.id}`, {"session.wizardData": {paymentId}});
      // test save msg session
      ctx.state.sessionMsg.url.searchParams.set("paymentId", paymentId);
      const inlineKeyboardArray = [];
      store.carriers().forEach((obj, key) => {
        if (obj.reqNumber) {
          inlineKeyboardArray.push([{text: obj.name, callback_data: `cO/cN?cId=${key}`}]);
        } else {
          inlineKeyboardArray.push([{text: obj.name, callback_data: `cO/wizard?cId=${key}`}]);
        }
      });
      inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: `cart?o=${objectId}`}]);
      await cartWizard[0](ctx, "Способ доставки", inlineKeyboardArray);
    }
    // set carrier number
    if (todo === "cN") {
      await cartWizard[1](ctx);
    }
    // save payment and goto wizard
    if (todo === "wizard") {
      const carrierId = + ctx.state.params.get("cId");
      // await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {carrierId}}});
      // test save msg session
      ctx.state.sessionMsg.url.searchParams.set("carrierId", carrierId);
      // if user not chuse carrier number
      const carrierNumber = + ctx.state.params.get("cN");
      if (carrierId === 2 && !carrierNumber) {
        // return first step error
        await cartWizard[1](ctx, "errorCurrierNumber");
        return;
      }
      // save carrierNumber
      if (carrierNumber) {
        // await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {carrierNumber}}});
        // test save msg session
        ctx.state.sessionMsg.url.searchParams.set("carrierNumber", carrierNumber);
      }
      await ctx.deleteMessage();
      await cartWizard[2](ctx);
    }
    // save last name user
    if (todo === "setCurrentLastName") {
      await cartWizard[4](ctx, ctx.from.last_name);
    }
    // save custom last name
    if (todo === "setLastName") {
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
      await cartWizard[5](ctx, ctx.from.first_name);
    }
    // save custom last name
    if (todo === "setFirstName") {
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
      ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
      await ctx.replyWithHTML("Нажмите кнопку Отправить свой номер" + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          keyboard: [
            [{
              text: "Отправить свой номер",
              request_contact: true,
            }],
            ["Отмена"],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }
    if (todo === "setPhoneNumber") {
      ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
      await ctx.replyWithHTML("Введите номер телефона" + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        },
      });
    }
    // set comment
    if (todo === "setComment") {
      ctx.state.sessionMsg.url.searchParams.set("cursor", 7);
      await ctx.replyWithHTML("Введите комментарий" + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        },
      });
    }
    if (todo === "setNoComment") {
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
        await ctx.reply("Спасибо за заказ! Скоро мы с Вами свяжемся. /objects", {
          reply_markup: {
            remove_keyboard: true,
          }});
      } catch (error) {
        await ctx.reply(`${error}`);
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
    const objectId = ctx.state.params.get("o");
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    let catalogUrl = `c/${catalog.id}?o=${objectId}`;
    // if (ctx.session.pathCatalog) {
    //   catalogUrl = ctx.session.pathCatalog;
    // }
    // const sessionPathCatalog = await store.findRecord(`users/${ctx.from.id}`, "session.pathCatalog");
    const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathCatalog");
    if (sessionPathCatalog) {
      catalogUrl = sessionPathCatalog;
    }
    inlineKeyboardArray.push([{text: `⤴️ ../${catalog.name}`,
      callback_data: catalogUrl}]);
    for (const tag of catalog.tags) {
      if (tag.id === ctx.state.params.get("tagSelected")) {
        inlineKeyboardArray.push([{text: `✅ ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}&o=${objectId}`}]);
      } else {
        inlineKeyboardArray.push([{text: `📌 ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}&o=${objectId}`}]);
      }
    }
    const object = await store.findRecord(`objects/${objectId}`);
    let publicImgUrl = null;
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name} > Фильтр</b>`,
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
  if (ctx.state.routeName === "showPhotos") {
    const productId = ctx.state.param;
    const objectId = ctx.state.params.get("o");
    const productRef = firebase.firestore().collection("objects").doc(objectId)
        .collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    for (const [index, photoId] of product.photos.entries()) {
      const inlineKeyboardArray = [];
      // if admin
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: "🏷 Set main",
          callback_data: `sMPh/${product.id}?pId=${photoId}&o=${objectId}`}]);
        inlineKeyboardArray.push([{text: "🗑 Delete",
          callback_data: `dPh/${product.id}?pId=${photoId}&o=${objectId}`}]);
      }
      inlineKeyboardArray.push([{text: "❎ Закрыть", callback_data: "closePhoto"}]);
      let caption = `<b>Фото #${index + 1}</b> ${product.name} (${product.id})`;
      if (product.mainPhoto === photoId) {
        caption = "✅ " + caption;
      }
      const media = await photoCheckUrl(`photos/o/${objectId}/p/${product.id}/${photoId}/2.jpg`);
      await ctx.replyWithPhoto(media, {
        caption,
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
// set product main photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "sMPh") {
    const productId = ctx.state.param;
    const mainPhoto = ctx.state.params.get("pId");
    const objectId = ctx.state.params.get("o");
    await store.updateRecord(`objects/${objectId}/products/${productId}`, {
      mainPhoto,
    });
    await ctx.editMessageCaption(`Main photo updated ${productId}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{text: "🗑 Delete", callback_data: `dPh/${productId}?pId=${mainPhoto}&o=${objectId}`}],
              [{text: "❎ Close", callback_data: "closePhoto"}],
            ],
          },
        });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// close photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "closePhoto") {
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// delete photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "dPh") {
    const productId = ctx.state.param;
    const deleteFileId = ctx.state.params.get("pId");
    const objectId = ctx.state.params.get("o");
    const productRef = firebase.firestore().collection("objects").doc(objectId)
        .collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    // if delete main Photo
    if (productSnapshot.data().mainPhoto === deleteFileId) {
      // set new main photo index 1 or delete
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
          photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
        });
      }
    } else {
      await productRef.update({
        photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
      });
    }
    // delete photos from bucket
    await bucket.deleteFiles({
      prefix: `photos/o/${objectId}/p/${productId}/${deleteFileId}`,
    });
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// upload photos limit 5
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhotoProduct") {
    const objectId = ctx.state.params.get("o");
    const productId = ctx.state.param;
    // firestore session
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": "uploadPhotoProduct",
      objectId,
      productId,
    }});
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    await ctx.replyWithHTML(`Добавьте фото <b>${product.name} (${product.id})</b>`);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// upload catalog photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhotoCat") {
    const objectId = ctx.state.params.get("o");
    const catalogId = ctx.state.param;
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": "uploadPhotoCat",
      objectId,
      catalogId,
    }});
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    await ctx.replyWithHTML(`Добавьте фото <b>${catalog.name} (${catalog.id})</b>`);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// upload product photos new
const uploadPhotoProduct = async (ctx, objectId, productId) => {
  if (productId && objectId) {
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    // get count photos to check limits 5 photos
    if (product.photos && product.photos.length > 4) {
      await ctx.reply("Limit 5 photos");
      return;
    }
    try {
      // upload only one photo!!!
      const photoId = await savePhotoTelegram(ctx, `photos/o/${objectId}/p/${product.id}`);
      // save file id
      if (!product.mainPhoto) {
        // set main photo
        await store.updateRecord(`objects/${objectId}/products/${productId}`, {
          mainPhoto: photoId,
          photos: firebase.firestore.FieldValue.arrayUnion(photoId),
        });
      } else {
        await store.updateRecord(`objects/${objectId}/products/${productId}`, {
          photos: firebase.firestore.FieldValue.arrayUnion(photoId),
        });
      }
      // get catalog url (path)
      let catalogUrl = `c/${product.catalog.id}?o=${objectId}&u=1`;
      // if (ctx.session.pathCatalog) {
      //   catalogUrl = ctx.session.pathCatalog;
      // }
      // const sessionPathCatalog = await store.findRecord(`users/${ctx.from.id}`, "session.pathCatalog");
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathCatalog");
      if (sessionPathCatalog) {
        catalogUrl = sessionPathCatalog;
      }
      const media = await photoCheckUrl(`photos/o/${objectId}/p/${product.id}/${photoId}/2.jpg`);
      await ctx.replyWithPhoto(media,
          {
            caption: `${product.name} (${product.id}) photo uploaded`,
            reply_markup: {
              inline_keyboard: [
                [{text: "📸 Upload photo", callback_data: `uploadPhotoProduct/${product.id}?o=${objectId}`}],
                [{text: `🖼 Show photos (${product.photos ? product.photos.length + 1 : 1})`,
                  callback_data: `showPhotos/${product.id}?o=${objectId}`}],
                [{text: "⤴️ Goto catalog",
                  callback_data: catalogUrl}],
              ],
            },
          });
      // clear session
      await store.createRecord(`users/${ctx.from.id}`, {"session": {
        "scene": null,
        "objectId": null,
        "productId": null,
      }});
    } catch (e) {
      await ctx.reply(`Error upload photos ${e.message}`);
      return;
    }
  } else {
    await ctx.reply("Please select a product to upload Photo");
  }
};
// upload catalog photo new
const uploadPhotoCat = async (ctx, objectId, catalogId) => {
  if (catalogId && objectId) {
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    // first delete old photos
    if (catalog.photoId) {
      await bucket.deleteFiles({
        prefix: `photos/o/${objectId}/c/${catalogId}`,
      });
    }
    // zoom level 2 (800*800)
    // const photoId = telegramPhotos[2].file_unique_id;
    // const photoUrl = await ctx.telegram.getFileLink(telegramPhotos[2].file_id);
    // try {
    //   // download photos from telegram server
    //   const photoPath = await download(photoUrl.href);
    //   await bucket.upload(photoPath, {
    //     destination: `photos/o/${objectId}/c/${catalog.id}/${photoId}.jpg`,
    //   });
    //   // delete download file
    //   fs.unlinkSync(photoPath);
    // } catch (e) {
    //   console.log("Download failed");
    //   console.log(e.message);
    //   await ctx.reply(`Error upload photos ${e.message}`);
    //   return;
    // }
    try {
      const photoId = await savePhotoTelegram(ctx, `photos/o/${objectId}/c/${catalog.id}`);

      await store.updateRecord(`objects/${objectId}/catalogs/${catalog.id}`, {
        photoId,
      });
      // get catalog url (path)
      const catalogUrl = `c/${catalog.id}?o=${objectId}`;
      const media = await photoCheckUrl(`photos/o/${objectId}/c/${catalog.id}/${photoId}/2.jpg`);
      await ctx.replyWithPhoto(media,
          {
            caption: `${catalog.name} (${catalog.id}) photo uploaded`,
            reply_markup: {
              inline_keyboard: [
                [{text: "⤴️ Goto catalog",
                  callback_data: catalogUrl}],
              ],
            },
          });
      await store.createRecord(`users/${ctx.from.id}`, {"session": {
        "scene": null,
        "objectId": null,
        "catalogId": null,
      }});
    } catch (e) {
      await ctx.reply(`Error upload photos ${e.message}`);
      return;
    }
  } else {
    await ctx.reply("Please select a product to upload Photo");
  }
};

exports.uploadPhotoProduct = uploadPhotoProduct;
exports.uploadPhotoCat = uploadPhotoCat;
exports.catalogsActions = catalogsActions;
exports.cartWizard = cartWizard;
exports.showCart = showCart;
